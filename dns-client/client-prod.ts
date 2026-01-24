// client.ts
import { encodeMessage } from "../dns-server/protocol.ts";
import { Message } from "../dns-server/protocol.ts";
const print = console.log;
const domain = ".my.domain.com"
let local = true;
let lastMsgId: number = 0;
let username: string = ""
const allMessages: Message[] = [];


function fixDnsEncoding(binaryString: string): string {
    // 1. Vytvoříme buffer o stejné délce
    const bytes = new Uint8Array(binaryString.length);
    
    // 2. Každý znak převedeme zpět na jeho byte hodnotu (0-255)
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    // 3. Dekódujeme pole bytů jako UTF-8
    return new TextDecoder("utf-8").decode(bytes);
}

async function sendMessage(input:string){
    // 1. Vstup od uživatele (zpráva)
    //const input = prompt("Message: ");
    let myText:string = "empty message";
    if(input != null){
        myText = input;
    }

    const sendMsg: Message = {  
        text: myText,
        id: 0,
        user: username
    };

    allMessages.push(sendMsg);


    // 2. Zakódování
    let encodedHex:string = encodeMessage(myText);

    // 2.5 Rozdělení po 63 znacích
    const encodedHexArray = encodedHex.match(/.{1,63}/g);
    if(encodedHexArray != null){
        encodedHex = encodedHexArray.join(".");    
    }
    const dnsQuery = `${encodedHex}${domain}`;

    console.log(`📝 Píšu zprávu: "${myText}"`);
    print("domain msg query:",dnsQuery);
    displayMessages(allMessages); 

    try{
        //using Deno.resolveDNS to send packets through DNS resolver and not directly to DNS server
        if(local == true){
            await Deno.resolveDns(dnsQuery, "TXT", {nameServer: { ipAddr: "127.0.0.1", port: 5300 }});
        } else{
            await Deno.resolveDns(dnsQuery, "TXT");
        }

    }catch(e){
        print(e);
    }
};

async function receiveMessages(username: string){ 
    const encodedHex:string = encodeMessage(`${username}-ping-${lastMsgId}`);
    const dnsQuery = `${encodedHex}${domain}`; //
    print("domain refresh query:",dnsQuery);

    let responses:string[][];
    if(local == true){
        responses = await Deno.resolveDns(dnsQuery, "TXT", {nameServer: { ipAddr: "127.0.0.1", port: 5300 }});
    } else{
        responses = await Deno.resolveDns(dnsQuery, "TXT");
    }
    

    const rawString = responses.flat().join(""); 
    print("DNS raw response:" + rawString);
    const fixedString = fixDnsEncoding(rawString);
    const jsonStartIndex = fixedString.indexOf("[{");
    const jsonEndIndex = fixedString.lastIndexOf("}]");
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        const jsonStr = fixedString.substring(jsonStartIndex, jsonEndIndex + 2);
        const chatHistory: Message[] = JSON.parse(jsonStr);
        chatHistory.forEach((msg: Message) =>{
            //console.log(`>${msg.user} ${msg.text} ${msg.id}`);
            if(msg.id>lastMsgId){
                allMessages.push(msg);
                lastMsgId = msg.id;
            }
            
        });
        displayMessages(allMessages);
    }
};

function displayMessages(allMsgs: Message[]):void{
    print("\n📬 --- CHAT HISTORY ---");
    allMsgs.forEach(msg => {
        if(msg.user !== username){
            print(`\t\t\t${msg.user}: ${msg.text}`);
        }else{
            print(`You:${msg.text}`)
        }
    });
    print("-----------------------");
}

function usernamePrompt():string{
    let usernameTmp;
    while(usernameTmp == "" || usernameTmp == null){
        usernameTmp = prompt("Username:");
    }
    return usernameTmp;
}

username = usernamePrompt();

setInterval(async() => {
    await receiveMessages(username);    
}, 5000);

//listenLoop();
const decoder = new TextDecoder();

for await(const chunk of Deno.stdin.readable){
    const rawtext = decoder.decode(chunk, { stream: true })
    const text = rawtext.trim();
    const userText = `${username}-${text}`
    print("sending text:",userText)
    if(text == "exit"){
        break;
    }

    await sendMessage(userText);
}

//use chcp 65001 on Windows for Czech
