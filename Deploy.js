
const puppeteer = require("puppeteer");
const path = require('path');
const exec = require("child_process").exec;


const NEW_SPACE_DEFINITION_FILE = process.env.NEW_SPACE_DEFINITION_FILE;
const DWC_URL = process.env.DWC_URL;
const DWC_PASSCODE_URL = process.env.DWC_PASSCODE_URL; 
const USERNAME = process.env.DWC_USER;
const PASSWORD = process.env.DWC_PASS;


let page;

const getPasscode = async () => {
    console.log('Inside get passcode module');
    await page.waitForSelector('div.island > h1 + h2', {visible: true, timeout: 20000}); 
    await page.reload();  
    return await page.$eval('h2', el => el.textContent);
}

const execCommand = async (command) => new Promise(async (res, rej) => {
    const passcode = await getPasscode();
    console.log('Passcode OK');
 
    const cmd = `${command} -H ${DWC_URL} -p ${passcode}`;
    console.log('command for space download', cmd);
    
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`error: ${error.message}`);
            if (error.code === 1) {
                res({ error, stdout, stderr });
            }else {
            rej({ error, stdout, stderr });
            }
        }
        else{
            res({ error, stdout, stderr });
        }
      
        console.log(`stdout:\n${stdout}`);
        console.log(`error:\n${error}`);
        console.log(`stderr:\n${stderr}`);

    });
});

(async () => {
    const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']}); 
    page = await browser.newPage();
    await page.goto(DWC_PASSCODE_URL);

    await page.waitForSelector('#logOnForm', {visible: true, timeout: 10000}); 
    if (await page.$('#logOnForm') !== null) {
        await page.type('#j_username', USERNAME);
        await page.type('#j_password', PASSWORD);
        await page.click('#logOnFormSubmit');
    }

//    console.log(process.env);
   await execCommand(`dwc cache-init`);
 
//--------- CREATE SPACE ------------------//
//  The below command will create dwc space from the supplied .json(-f) file    

   await execCommand(`dwc spaces create -f ${NEW_SPACE_DEFINITION_FILE}`);
   console.log('MAIN after executing commands');

   await browser.close();
})

();
