// server.ts
import { DecodeByBase36, DecodeByBase36ToBytes, encodeByBase64, decodeByBase64 } from "./protocol.ts";

function decodeMessage(hex: string): string {
  const cleanHex = hex.replace(/\./g, "");
  
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

interface Message{
  text: string;
  id: number;
  user: string;
  nonDupId: number;
}

const print = console.log;

const PORT:number = 5300;
const HOSTNAME: string = "0.0.0.0";
let logging: boolean = true;

const messages: Message[] = [];
const unfinishedMessages: Message[] = [];
let lastId:number = 1;

console.log(`📡 DNS Chat running on port ${PORT}`);

const socket = Deno.listenDatagram({ port: PORT, transport: "udp", hostname: HOSTNAME });

function parseDomainName(buffer: Uint8Array, offset: number): string { 
  const parts: string[] = [];
  let current = offset;
  while (buffer[current] !== 0) {
    const length = buffer[current];
    current++;
    const label = new TextDecoder().decode(buffer.subarray(current, current + length));
    parts.push(label);
    current += length;
  }
  return parts.join(".");
}

function buildResponse(req: Uint8Array, txt: string): Uint8Array {
    // 1. Find the end of Question part
    let qEnd = 12;
    while (req[qEnd] !== 0) qEnd++;
    qEnd += 5; // null byte + type(2) + class(2)

    // Prepare the buffer (now it is set for 1024 bytes, but UDP limit is around 1232 bytes, 512 bytes is a safe spot)
    const res = new Uint8Array(1024);
    const v = new DataView(res.buffer);

    // 2. Copy headers and Question from request
    res.set(req.subarray(0, qEnd), 0);

    // 3. Edit headers (Flags)
    let f = v.getUint16(2);
    f |= 0x8400; // QR (Response) = 1, AA (Authoritative) = 1
    f &= ~0x000F; // RCODE = 0 (No Error)
    // Keeping RD bit from request
    v.setUint16(2, f);

    v.setUint16(4, 1); // QDCOUNT = 1
    v.setUint16(6, 1); // ANCOUNT = 1 (Answser)
    v.setUint16(8, 0); // NSCOUNT = 0
    v.setUint16(10, 0); // ARCOUNT = 0

    // 4. start of Answer part
    let off = qEnd;
    
    // NAME: Settting pointer at the start (0xC00C -> offset 12)
    v.setUint16(off, 0xC00C); off += 2;
    
    // TYPE: TXT (16)
    v.setUint16(off, 16); off += 2;
    
    // CLASS: IN (1)
    v.setUint16(off, 1); off += 2;
    
    // TTL: 0 (Time to Live 0 secons - really important to not cache server responses)
    v.setUint32(off, 0); off += 4;

    // 5. Preparing data (TXT RDATA)
    const tb = new TextEncoder().encode(txt);
    
    // Total length of response must be calculated - RDATA (all chunks + thier bytes length)
    // If the response text has 300 znaků:
    // Chunk 1: 255 characters + 1 byte of length
    // Chunk 2: 45 characters + 1 byte of length
    // RDLENGTH = 255 + 1 + 45 + 1 = 302
    
    let totalRDataLen = 0;
    let remaining = tb.length;
    let chunks = 0;
    
    // Length calculation
    while(remaining > 0) {
        const chunkSize = Math.min(255, remaining);
        totalRDataLen += (chunkSize + 1);
        remaining -= chunkSize;
        chunks++;
    }
    // If the string is empty, TXT must have at least one byte - 0
    if (tb.length === 0) totalRDataLen = 1;

    // setting RDLENGTH
    v.setUint16(off, totalRDataLen); off += 2;

    // 6. Setting chunks
    let writeOffset = 0;
    remaining = tb.length;

    if (remaining === 0) {
        res[off] = 0; off++;
    } else {
        while (remaining > 0) {
            const chunkSize = Math.min(255, remaining);
            
            // Chunks length (1 byte)
            res[off] = chunkSize; off++;
            
            // Chunks data
            res.set(tb.subarray(writeOffset, writeOffset + chunkSize), off);
            
            off += chunkSize;
            writeOffset += chunkSize;
            remaining -= chunkSize;
        }
    }

    // Return of cut array by length
    return res.subarray(0, off);
}


function isCorrectFormat(plaintextMsg:string): boolean{
  if(plaintextMsg.split('.').length > 4){
    return true;
  }
  return false;
}

async function handleServer() {
  for await (const [data, remoteAddr] of socket) {
    //print(data);
    try {
      const domain = parseDomainName(data, 12);

      // Protocol: chat.domain.com
      // The first domain label (on leftside) is our message
      const encodedMessages = domain.split(".").slice(0,-3);
      print("encodedMessages", encodedMessages);
      const encodedUsername = encodedMessages.at(0) || "[Invalid format]";
      const encodedNonDupId = encodedMessages.at(-1) || "[Invalid format]";
      let encodedText = encodedMessages.slice(1,-1).join("");

      print("Refactored Msg:",encodedUsername, encodedNonDupId, encodedText);
      if(logging == true){
        print(domain);
        print("firstLabel:",encodedMessages);
      }
      // Message needs to be decoded from Base32 encoding
      const incomingMsg:string = encodedMessages.join("");
      
      let username = "";
      let text = "";
      let lastSentId: number = 0;
      try {
        username = DecodeByBase36(encodedUsername);
        const textBytes = DecodeByBase36ToBytes(encodedText);
        text = textBytes.toBase64();
        lastSentId = Number(DecodeByBase36(encodedNonDupId));
      } catch {
          // If it's not hex, it is some random stuff
          text = "[Invalid format]";
      }

      let otherUsersMsgs: Message[] = [];
      if (![encodedUsername,text,encodedNonDupId].includes("[Invalid format]") && text.length > 0 && remoteAddr.transport === "udp") {
        
        print(`💬 New message from ${remoteAddr.hostname}: "${username} ${text} ${lastSentId}"`);
        const isDuplicate = messages.some((msg: Message) => msg.user === username && msg.text === text && msg.nonDupId === lastSentId);

        if (isDuplicate) {
          if(logging == true){
            print(`Duplicated packet ignored (DNS Retry) od: ${username} ${text},`);
          }
        } else if(!decodeByBase64(text).startsWith("ping")){
          const message: Message = {
            text: text, 
            id: lastId, 
            user: username,
            nonDupId: lastSentId
          };
          messages.push(message);
          lastId++;
        }
        
        // Maintain history size to 10 last messages
        if (messages.length > 10) messages.shift();
        print(messages);
        //messages.forEach(message => {
        //  if(message.user != username){
        //    //print("Comparison:" +  message.user + username)
        //    otherUsersMsgs.push(message);
        //  }
        //});
        otherUsersMsgs = messages.filter((msg)=> msg.user !== username);
      }

      // Sending response as JSON
      const responseText = JSON.stringify(otherUsersMsgs.slice(-3)); // Sending last 3 messages
      if(logging == true) { print(responseText) }
      
      const responsePacket = buildResponse(data, responseText);
      await socket.send(responsePacket, remoteAddr);
      otherUsersMsgs = [];
    } catch (err) {
      console.error("Error: ", err);
    }
  }
}

handleServer();