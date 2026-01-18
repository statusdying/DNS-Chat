import {Message} from "../dns-server/protocol.ts"
const messages: Message[] = 
[
    {
        text: "msg1",
        id: 1,
        user: "Ja"
    },
    {
        text: "msg2",
        id: 2,
        user: "User2"
    },
        {
        text: "msg3",
        id: 3,
        user: "User3"
    }
];

console.log("Webové GUI běží na: http://127.0.0.1:8080");

//try {
//  const command = new Deno.Command(Deno.build.os === "windows" ? "explorer" : "open", {
//    args: ["http://127.0.0.1:8080"],
//  });
//  command.spawn();
//} catch (e) {
//  // Ignoruj chybu, pokud se nepodaří otevřít prohlížeč
//}

Deno.serve({
  port: 8080,
  hostname: "127.0.0.1",
  handler: async (req) => {
    const url = new URL(req.url);

    // API Endpoint pro data
    if (url.pathname === "/api/messages") {
      return new Response(JSON.stringify(messages), {
        headers: { "content-type": "application/json" },
      });
    }

    // Hlavní stránka


    //return new Response(htmlContent, {
    //  headers: { "content-type": "text/html; charset=utf-8" },
    //});
    const file = await Deno.open("./index.html", { read: true });
    return new Response(file.readable);
  },
});

// Simulace přibývání zpráv na pozadí (pro test)
setInterval(() => {
    messages.push({
        id: Date.now(),
        user: Math.random() > 0.5 ? "Ja" : "Bob",
        text: "Náhodná zpráva " + Math.random().toString(36).substring(7)
    });
    if(messages.length > 20) messages.shift();
}, 3000);