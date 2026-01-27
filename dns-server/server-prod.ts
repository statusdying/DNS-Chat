// server.ts
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

const PORT = 5300;
const HOSTNAME = "0.0.0.0"

const messages: Message[] = [];
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
    // 1. Najdi konec sekce Question (stejné jako u vás)
    let qEnd = 12;
    while (req[qEnd] !== 0) qEnd++;
    qEnd += 5; // null byte + type(2) + class(2)

    // Připravíme buffer (zvětšil jsem na 1024 pro jistotu, ale pozor na UDP limit ~1232B, bezpečné je 512)
    const res = new Uint8Array(1024);
    const v = new DataView(res.buffer);

    // 2. Zkopírujeme hlavičku a Question z dotazu
    res.set(req.subarray(0, qEnd), 0);

    // 3. Upravíme hlavičku (Flags)
    let f = v.getUint16(2);
    f |= 0x8400; // QR (Response) = 1, AA (Authoritative) = 1
    f &= ~0x000F; // RCODE = 0 (No Error)
    // Zachováme RD bit z requestu (pokud tam byl), i když my rekursi neděláme
    v.setUint16(2, f);

    v.setUint16(4, 1); // QDCOUNT = 1
    v.setUint16(6, 1); // ANCOUNT = 1 (Odpověď)
    v.setUint16(8, 0); // NSCOUNT = 0
    v.setUint16(10, 0); // ARCOUNT = 0

    // 4. Začátek sekce Answer
    let off = qEnd;
    
    // NAME: Použijeme pointer na začátek (0xC00C -> offset 12)
    v.setUint16(off, 0xC00C); off += 2;
    
    // TYPE: TXT (16)
    v.setUint16(off, 16); off += 2;
    
    // CLASS: IN (1)
    v.setUint16(off, 1); off += 2;
    
    // TTL: 0 (velmi důležité pro chat, aby se necacheovalo!)
    v.setUint32(off, 0); off += 4;

    // 5. Příprava dat (TXT RDATA)
    const tb = new TextEncoder().encode(txt);
    
    // Musíme spočítat celkovou délku RDATA (všechny chunky + jejich length byty)
    // Pokud má text 300 znaků:
    // Chunk 1: 255 znaků + 1 byte délky
    // Chunk 2: 45 znaků + 1 byte délky
    // RDLENGTH = 255 + 1 + 45 + 1 = 302
    
    let totalRDataLen = 0;
    let remaining = tb.length;
    let chunks = 0;
    
    // Rychlý výpočet délky před zápisem
    while(remaining > 0) {
        const chunkSize = Math.min(255, remaining);
        totalRDataLen += (chunkSize + 1);
        remaining -= chunkSize;
        chunks++;
    }
    // Pokud je string prázdný, TXT musí mít alespoň jeden byte 0
    if (tb.length === 0) totalRDataLen = 1;

    // Zápis RDLENGTH
    v.setUint16(off, totalRDataLen); off += 2;

    // 6. Zápis samotných chunků
    let writeOffset = 0;
    remaining = tb.length;

    if (remaining === 0) {
        res[off] = 0; off++;
    } else {
        while (remaining > 0) {
            const chunkSize = Math.min(255, remaining);
            
            // Délka chunku (1 byte)
            res[off] = chunkSize; off++;
            
            // Data chunku
            res.set(tb.subarray(writeOffset, writeOffset + chunkSize), off);
            
            off += chunkSize;
            writeOffset += chunkSize;
            remaining -= chunkSize;
        }
    }

    // Vrátíme oříznuté pole přesně podle délky
    return res.subarray(0, off);
}


function isCorrectFormat(plaintextMsg:string): boolean{
  if(plaintextMsg.indexOf('-') > 0){
    return true;
  }
  return false;
}

async function handleServer() {
  for await (const [data, remoteAddr] of socket) {
    //print(data);
    try {
      const domain = parseDomainName(data, 12);
      print(domain);

      // Protokol: hexkod.chat.local
      // První část domény je naše zpráva
      const encodedMessages = domain.split(".").slice(0,-3);
      print("firstLabel:",encodedMessages);
      // Zkusíme dekódovat zprávu
      const incomingMsg:string = encodedMessages.join("");
      
      let decodedMessage:string;
      try {
          decodedMessage = decodeMessage(incomingMsg)
      } catch {
          // Pokud to není hex, asi je to jen nějaký ping nebo bordel
          decodedMessage = "[Neplatný formát]";
      }

      if(!isCorrectFormat(decodedMessage)){
        decodedMessage = "[Neplatný formát]";
      }

      const firstHyphen: number = decodedMessage.indexOf('-');
      const lastHyphen: number = decodedMessage.lastIndexOf('-');
      const username = decodedMessage.slice(0, firstHyphen);
      const text = decodedMessage.slice(firstHyphen + 1, lastHyphen);
      const lastSentId: number = Number(decodedMessage.slice(lastHyphen + 1));
      let otherUsersMsgs: object[] = [];
      if (decodedMessage !== "[Neplatný formát]" && decodedMessage.length > 0 && remoteAddr.transport === "udp") {
        
        console.log(`💬 Nová zpráva od ${remoteAddr.hostname}: "${decodedMessage}"`);
        
        const lastMsg = messages[messages.length - 1];
        const isDuplicate = lastMsg && lastMsg.user === username && lastMsg.text === text && lastMsg.nonDupId === lastSentId;

        if (isDuplicate) {
          console.log(`Duplicated packet ignored (DNS Retry) od: ${username} ${text},`);

        } else if(!text.startsWith("ping")){
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
      

      
      
        messages.forEach(message => {
          if(message.user != username){
            //print("Comparison:" +  message.user + username)
            otherUsersMsgs.push(message);
          }
        });
      }

      // Odpověď: Pošleme poslední zprávy jako JSON (aby to klient mohl parsovat)
      // Protože TXT záznam má limit cca 255 znaků na string, musíme být struční.
      const responseText = JSON.stringify(otherUsersMsgs.slice(-3)); // Pošleme jen poslední 3
      print(responseText)
      const responsePacket = buildResponse(data, responseText);
      await socket.send(responsePacket, remoteAddr);
      otherUsersMsgs = [];
    } catch (err) {
      console.error("Error: ", err);
    }
  }
}

handleServer();