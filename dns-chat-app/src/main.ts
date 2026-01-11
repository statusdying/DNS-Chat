import { encodeMessage } from "./protocol";
import { UdpClient } from "./udpClient";

// ⚠️ Změň na IP svého počítače v lokální síti!
// localhost (127.0.0.1) na Androidu nefunguje (odkazuje na samotný telefon).
const SERVER_IP = " 192.168.56.1"; // <--- ZJISTI SI SVOU IP (např. ipconfig/ifconfig)
const SERVER_PORT = 5300;

const client = new UdpClient(SERVER_IP, SERVER_PORT);
const logsDiv = document.getElementById("logs") as HTMLDivElement;
const input = document.getElementById("msgInput") as HTMLInputElement;
const btn = document.getElementById("sendBtn") as HTMLButtonElement;

function log(text: string) {
  const div = document.createElement("div");
  div.className = "msg";
  div.textContent = text;
  logsDiv.appendChild(div);
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

// Funkce zkopírovaná z client.ts (lehce upravená pro TS/Browser)
function createQueryPacket(domain: string): Uint8Array {
  const buffer = new Uint8Array(512);
  const view = new DataView(buffer.buffer);
  
  const id = Math.floor(Math.random() * 65535);
  view.setUint16(0, id); view.setUint16(2, 0x0100); view.setUint16(4, 1);
  
  let offset = 12;
  const labels = domain.split(".");
  for (const label of labels) {
    buffer[offset] = label.length; offset++;
    new TextEncoder().encodeInto(label, buffer.subarray(offset)); offset += label.length;
  }
  buffer[offset] = 0; offset++;
  view.setUint16(offset, 1); offset += 2; // Type A
  view.setUint16(offset, 1); offset += 2; // Class IN
  
  return buffer.subarray(0, offset);
}

async function sendMessage() {
  const text = input.value;
  if (!text) return;

  try {
    log(`📤 Odesílám: ${text}`);
    
    // 1. Zakódování
    const encoded = encodeMessage(text);
    const domain = `${encoded}.chat.local`;
    const packet = createQueryPacket(domain);

    // 2. Odeslání přes UDP plugin
    await client.send(packet);

    // 3. Čekání na odpověď
    const response = await client.receiveOne();
    
    // 4. Parsování (Simple JSON extraction)
    const decoder = new TextDecoder();
    const rawString = decoder.decode(response);
    const jsonStart = rawString.indexOf("[");
    const jsonEnd = rawString.lastIndexOf("]");
    
    if (jsonStart !== -1) {
      const json = rawString.substring(jsonStart, jsonEnd + 1);
      const messages = JSON.parse(json);
      log(`📥 Historie: ${messages.join(" | ")}`);
    } else {
      log("📥 Přišla odpověď, ale bez dat.");
    }

    input.value = "";
  } catch (err: any) {
    log(`❌ Chyba: ${err.message || err}`);
    // Fallback info pro prohlížeč
    if (!window.chrome || !window.chrome.sockets) {
      log("⚠️ Jsi v prohlížeči. UDP Plugin funguje jen na zařízení/emulátoru.");
    }
  }
}

btn.addEventListener("click", sendMessage);