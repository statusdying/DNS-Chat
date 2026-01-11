// server.ts
import { decodeMessage } from "./protocol.ts";

const PORT = 5300;

const messages: string[] = [];

console.log(`📡 DNS Chat Server běží na portu ${PORT}`);

const socket = Deno.listenDatagram({ port: PORT, transport: "udp" });

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
    // Zkopírovat buildResponse z minula, je to dlouhé :) 
    // Nebo řekni, pokud to chceš poslat celé znovu.
    // ...
    // Placeholder implementace pro kontext:
    let qEnd = 12; while (req[qEnd] !== 0) qEnd++; qEnd += 5;
    const res = new Uint8Array(512); const v = new DataView(res.buffer);
    res.set(req.subarray(0, qEnd), 0);
    let f = v.getUint16(2); f |= 0x8400; f &= ~0x000F; v.setUint16(2, f);
    v.setUint16(4, 1); v.setUint16(6, 1);
    let off = qEnd; v.setUint16(off, 0xC00C); off+=2; v.setUint16(off, 16); off+=2;
    v.setUint16(off, 1); off+=2; v.setUint32(off, 0); off+=4;
    const tb = new TextEncoder().encode(txt);
    v.setUint16(off, tb.length + 1); off+=2; res[off] = tb.length; off++;
    res.set(tb, off); off+=tb.length; return res.subarray(0, off);
}

async function handleServer() {
  for await (const [data, remoteAddr] of socket) {
    try {
      const domain = parseDomainName(data, 12);
      
      // Protokol: hexkod.chat.local
      // První část domény je naše zpráva
      const firstLabel = domain.split(".")[0];
      
      // Zkusíme dekódovat zprávu
      let incomingMsg = "";
      try {
        incomingMsg = decodeMessage(firstLabel);
      } catch {
        // Pokud to není hex, asi je to jen nějaký ping nebo bordel
        incomingMsg = "[Neplatný formát]";
      }

      if (incomingMsg !== "[Neplatný formát]" && incomingMsg.length > 0 && remoteAddr.transport === "udp") {
        console.log(`💬 Nová zpráva od ${remoteAddr.hostname}: "${incomingMsg}"`);
        messages.push(incomingMsg);
        
        // Udržujeme jen posledních 10 zpráv
        if (messages.length > 10) messages.shift();
      }

      // Odpověď: Pošleme poslední zprávy jako JSON (aby to klient mohl parsovat)
      // Protože TXT záznam má limit cca 255 znaků na string, musíme být struční.
      const responseText = JSON.stringify(messages.slice(-3)); // Pošleme jen poslední 3

      const responsePacket = buildResponse(data, responseText);
      await socket.send(responsePacket, remoteAddr);

    } catch (err) {
      console.error("Chyba:", err);
    }
  }
}

handleServer();