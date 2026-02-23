function* idGenerator() {
    let id = 48;
    let id2 = 48;
    while(true){
        yield String.fromCharCode(id2).concat(String.fromCharCode(id));
        [id, id2] = increment(id,id2);
    }

    function increment(num: number, num2: number){
        num++; 
        if(num > 57 && num < 97){
            num = 97;
        }else if(num > 122){
            num = 48;
            num2++;
            if(num2 > 57 && num2 < 97){
                num2 = 97;
            }else if(num2 > 122){
                num2 = 48;
            }
        }
        return [num, num2];
    }

}
const x:Generator = idGenerator();

//console.log(x.next(), x.next());
//console.log(x.next(), x.next());

for(let i = 0; i<=1300; i++){
    //let y = String.fromCharCode(i);
    //console.log(i, "|", String.fromCharCode(i), "|", "|", y.charCodeAt(0));
    const id = x.next().value;
    console.log(i, "|", id, "|") // String.fromCharCode(id1), String.fromCharCode(id2)
}