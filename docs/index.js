const fs = require('fs');
const order = [
    'auth',
    'login_flow',
    'client',
    'mrss',
    'user',
    'outlet',
    'post',
    'gallery',
    'story',
    'assignment',
    'purchases',
    'notifications',
    'search',
    'social',
    'terms'
];

const generateUTF8 = () => {
    const files = fs.readdirSync(__dirname);
    const models = fs.readdirSync(`${__dirname}/models`);

    //Start with header
    let output = fs.readFileSync(`${__dirname}/resources/header.apib`, 'utf8')

    //Append model files
    for (model of models) {
        const fileContents = fs.readFileSync(`${__dirname}/models/${model}`, 'utf8');
        output += `\n${fileContents}`;
    }

    //Append resource files
    for (file of order) {
        const fileContents = fs.readFileSync(`${__dirname}/resources/${file}.apib`, 'utf8');
        output += `\n${fileContents}`;
    }

    return output;
}


module.exports = generateUTF8;
