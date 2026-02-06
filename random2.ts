import { config } from "./config.ts";
import { EncodeByBase36 } from "./dns-server/protocol.ts";
let print = console.log;
//
//const text = "hello world yepěščěčš§ů.)ú..ú)čšě365434ščě čššě sd dfšěč.ů§";
//
//
//print(EncodeByBase36(" "));
//print(EncodeByBase36("hello"), EncodeByBase36("\xFF"), EncodeByBase36("world"), EncodeByBase36(" "), EncodeByBase36("yep"));
//print(EncodeByBase36(text));

const domain: string = config.dns_server_domain;
const password: string = config.password;
let text = "hello how are you? řččččččččččččččččččččččččččččččččččččččřřřřřřřřřřřřřřřřřřřřřřřřěčšššššššššš"
let NonDupId: number = 0;
let username: string = "User454";

function calculateBestPossibleTextLength(domain: string, username: string, text: string, NonDupId: any): number{
    if(!domain.startsWith(".")){
        domain = domain + "."
    }
    // 253 is max possible length to use minus domain name and minus 3 for having every 64th char as dot
    let freeSpace = 253 - domain.length - 3;
    let approxFreeLength = Math.floor(freeSpace / 1.5479) //  approximate length change by 1.5479
    approxFreeLength = approxFreeLength - username.length - NonDupId.toString().length - 2; // <username> - <text> - <id>, 2 means count of hyphens
    print(approxFreeLength, "free space for Text from" ,freeSpace);
    return approxFreeLength;
}

let BestPossibleTextLength = calculateBestPossibleTextLength(domain, username, text, NonDupId);

function fillMaxTextLength(domain: string, username: string, text: string, NonDupId: any, bestPossibleTextLength: number){
    
    let subText = text.substring(0, bestPossibleTextLength);
    let encodedMsg = EncodeByBase36(`${username}-${text}-${NonDupId}`);
    let encodedMsgArray = encodedMsg.match(/.{1,63}/g);
    let encodedMsgWithDots: string = "";
    if(encodedMsgArray != null){
        encodedMsgWithDots = encodedMsgArray.join(".");    
    }
    const QueryLength:number = (`${encodedMsgWithDots}${domain}`).length;
    print(QueryLength);
}
fillMaxTextLength(domain, username, text, NonDupId, BestPossibleTextLength);