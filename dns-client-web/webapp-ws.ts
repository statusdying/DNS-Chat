import { Message } from "../dns-server/protocol.ts"
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


Deno.serve({
  port: 8081,
  async handler(request) {
    if (request.headers.get("upgrade") !== "websocket") {
      // If the request is a normal HTTP request,
      // we serve the client HTML file.
      const file = await Deno.open("./index-copy.html", { read: true });
      return new Response(file.readable);
    }
    // If the request is a websocket upgrade,
    // we need to use the Deno.upgradeWebSocket helper
    const { socket, response } = Deno.upgradeWebSocket(request);

    socket.onopen = () => {
      console.log("CONNECTED");
    };
    socket.onmessage = (event) => {
      console.log(`RECEIVED: ${event.data}`);
      //TODO move from onmessage to DNS Client Message Received
      socket.send(JSON.stringify(messages));
    };
    socket.onclose = () => console.log("DISCONNECTED");
    socket.onerror = (error) => console.error("ERROR:", error);

    return response;
  },
});