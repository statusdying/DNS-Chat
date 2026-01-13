// server.ts
import { decodeMessage } from "./protocol.ts";
import { Message } from "./protocol.ts";
const print = console.log;

const PORT = 5300;
const HOSTNAME = "0.0.0.0"

const messages: Message[] = [];
let lastId:number = 0;

console.log(`📡 DNS Chat Server běží na portu ${PORT}`);

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
    // 1. Bezpečnější nalezení konce Question sekce
    let qEnd = 12; 
    // Hledáme 0-byte (konec domény), ale hlídáme, abychom nepřečetli paměť mimo buffer
    while (qEnd < req.length && req[qEnd] !== 0) {
        qEnd++;
    }
    // Pokud jsme nenašli 0 nebo jsme na konci, je to vadný paket -> vrátíme prázdnou odpověď (nebo throw)
    if (qEnd >= req.length) throw new Error("Vadný formát DNS dotazu (chybí null byte)");
    
    qEnd += 5; // +1 za null byte, +2 Type, +2 Class

    const res = new Uint8Array(512); 
    const v = new DataView(res.buffer);
    
    // Zkopírovat hlavičku a dotaz
    res.set(req.subarray(0, qEnd), 0);
    
    // Nastavit Flagy (Response, Authoritative, No Error)
    let f = v.getUint16(2); 
    f |= 0x8400; 
    f &= ~0x000F; 
    v.setUint16(2, f);
    
    v.setUint16(4, 1); // QDCOUNT (1)
    v.setUint16(6, 1); // ANCOUNT (1)
    v.setUint16(8, 0); // NSCOUNT (0) - Důležité pro nslookup!
    v.setUint16(10, 0); // ARCOUNT (0) - Důležité pro nslookup!

    // Sestavení TXT odpovědi
    let off = qEnd; 
    v.setUint16(off, 0xC00C); off+=2; // Pointer na jméno
    v.setUint16(off, 16); off+=2;     // TYPE TXT
    v.setUint16(off, 1); off+=2;      // CLASS IN
    v.setUint32(off, 0); off+=4;      // TTL
    
    const tb = new TextEncoder().encode(txt);
    // DNS TXT záznam má limit 255 znaků na jeden string blok
    // Pokud je delší, měl by se rozdělit, ale pro chat to teď neřešme (ořízne se nebo bude nevalidní)
    const len = tb.length > 255 ? 255 : tb.length;
    
    v.setUint16(off, len + 1); off+=2; // RDLENGTH
    res[off] = len; off++;             // TXT Length byte
    res.set(tb.subarray(0, len), off); off+=len; 
    
    return res.subarray(0, off);
}

async function handleServer() {
  console.log("Čekám na zprávy...");
  for await (const [data, remoteAddr] of socket) {
    try {
      console.log(`📨 Přijat paket od ${remoteAddr.hostname}:${remoteAddr.port} (délka: ${data.length})`);
      
      const domain = parseDomainName(data, 12);
      console.log(`🔍 Dotaz na doménu: ${domain}`);

      // ... zde je tvoje logika s firstLabel a decodeMessage ...
      // (tuto část neměň, jen pro přehlednost ji zde zkracuji)
      const firstLabel = domain.split(".")[0];
      let incomingMsg = "[Neplatný formát]";
      try { incomingMsg = decodeMessage(firstLabel); } catch {}
      // ...

      // Příprava odpovědi
      const responseText = JSON.stringify(messages.slice(-3));
      console.log(`📤 Odesílám odpověď: ${responseText}`);

      const responsePacket = buildResponse(data, responseText);
      await socket.send(responsePacket, remoteAddr);
      console.log("✅ Odesláno.");

    } catch (err) {
      console.error("❌ CHYBA v handleServer:", err);
    }
  }
}

handleServer();