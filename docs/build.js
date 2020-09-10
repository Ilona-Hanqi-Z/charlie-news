const fs = require('fs');
const docs = require('./');

//Write output
fs.writeFile(`apiary.apib`, docs(), (err) => {
    if (err) {
        console.log(`Error generating docs - ${err}`)
    } else {
        console.log(`[ ${(new Date()).toLocaleString()} ] Documents have been generated into '/apiary.apib'\n`);
    }
});