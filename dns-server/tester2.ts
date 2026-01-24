//const aaaa = await Deno.resolveDns("example.com", "TXT", {
//  nameServer: { ipAddr: "127.0.0.1", port: 5300 },
//});
//console.log(aaaa);



const txt = await Deno.resolveDns("7864652d61686f6a61686f6a.my.domain.com", "TXT");
console.log(txt);