// src/UdpClient.ts

// Definujeme typy pro globální objekt 'chrome', který plugin přidává
declare global {
  interface Window {
    chrome: any;
  }
}

export class UdpClient {
  private socketId: number | null = null;
  private serverIp: string;
  private serverPort: number;

  constructor(serverIp: string, serverPort: number) {
    this.serverIp = serverIp;
    this.serverPort = serverPort;
  }

  // Inicializace socketu
  async init(): Promise<void> {
    if (!window.chrome || !window.chrome.sockets) {
      throw new Error("UDP plugin není dostupný. Jsi na mobilním zařízení?");
    }

    return new Promise((resolve) => {
      window.chrome.sockets.udp.create({}, (socketInfo: any) => {
        this.socketId = socketInfo.socketId;
        // Bind na port 0 (jakýkoliv volný)
        window.chrome.sockets.udp.bind(this.socketId, "0.0.0.0", 0, (result: number) => {
          if (result < 0) {
            console.error("Bind failed");
          } else {
            console.log(`UDP Socket ready (ID: ${this.socketId})`);
            resolve();
          }
        });
      });
    });
  }

  // Odeslání dat
  async send(data: Uint8Array): Promise<void> {
    if (this.socketId === null) await this.init();

    return new Promise((resolve, reject) => {
      window.chrome.sockets.udp.send(
        this.socketId,
        data.buffer,
        this.serverIp,
        this.serverPort,
        (sendInfo: any) => {
          if (sendInfo.resultCode < 0) {
            reject("Send failed: " + sendInfo.resultCode);
          } else {
            resolve();
          }
        }
      );
    });
  }

  // Poslech odpovědi (jednorázový - čeká na první odpověď)
  async receiveOne(): Promise<Uint8Array> {
    if (this.socketId === null) await this.init();

    return new Promise((resolve) => {
      // Nastavíme listener
      const listener = (info: any) => {
        if (info.socketId !== this.socketId) return;

        // Odebereme listener, aby se nevolal opakovaně
        window.chrome.sockets.udp.onReceive.removeListener(listener);

        // Data přijdou jako ArrayBuffer
        resolve(new Uint8Array(info.data));
      };

      window.chrome.sockets.udp.onReceive.addListener(listener);
    });
  }
}