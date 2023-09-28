

const puppeteer = require("puppeteer");
const exec = require("child_process").exec;
const fs = require('fs-extra');


const SPACE_DEFINITION_FILE = process.env.SPACE_DEFINITION_FILE;
const NEW_SPACE_DEFINITION_FILE = process.env.NEW_SPACE_DEFINITION_FILE;
const SPACE = process.env.SPACE;
const SPACEQA = process.env.SPACEQA;
const LABELQA = process.env.LABELQA;
const ENTITIES = process.env.ENTITIES;
const HDIDEV = process.env.HDIDEV;
const HDIQA = process.env.HDIQA;
const DWC_URL = process.env.DWC_URL;
const DWC_PASSCODE_URL = process.env.DWC_PASSCODE_URL; 
const USERNAME = process.env.DWC_USER;
const PASSWORD = process.env.DWC_PASS;


let page;

const getPasscode = async () => {
    console.log('Inside get passcode module');
    await page.waitForSelector('div.island > h1 + h2', {visible: true, timeout: 5000}); 
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

    await page.waitForSelector('#logOnForm', {visible: true, timeout: 5000}); 
    if (await page.$('#logOnForm') !== null) {
        await page.type('#j_username', USERNAME);
        await page.type('#j_password', PASSWORD);
        await page.click('#logOnFormSubmit');
    }
 
//--------- READ DEV SPACE ------------------//

   console.log(process.env);
   await execCommand(`dwc cache-init`);
   await execCommand(`dwc spaces read -s ${SPACE} -o ${SPACE_DEFINITION_FILE} -d ${ENTITIES}`);
  
//--------- CREATE/UPDATE QA SPACE ------------------//

    const spaceContent = await fs.readFile(SPACE_DEFINITION_FILE, 'utf-8')
    console.log('Read file');
    const replacer = new RegExp(HDIDEV, 'gi')
    const spaceContentQA = spaceContent.replace(replacer, HDIQA);

//  parse the downloaded space definition file
    const spaceDefinition = JSON.parse(spaceContentQA);
//  We need to update the SPACE ID as well the dbuser as it is specific to space
// First lets get the current space name and label and get the dbusername.
    const dbuser_name = SPACE +'#'+ spaceDefinition[SPACE].spaceDefinition.label;
//  copy the dbuser details into a placeholder for now, we will attach the same config to new dbuser.
    const dbuser_details = spaceDefinition[SPACE].spaceDefinition.dbusers[dbuser_name];
    
    console.log(dbuser_details);
    console.log(spaceDefinition[SPACE].spaceDefinition.dbusers)
    
    // update to new dbusername
    const dbuser_name_new = SPACEQA+'#'+LABELQA;

    // const dbuserjson = JSON.stringify([dbuser_name_new]: dbuser_details)
// parse the created json otherwise it would add double escape / later
    const dbuser_json = JSON.parse(JSON.stringify({ [dbuser_name_new] : dbuser_details}));
    // Udpate laberl and dbuser details with new one
    spaceDefinition[SPACE].spaceDefinition.label = LABELQA;
    spaceDefinition[SPACE].spaceDefinition.dbusers = dbuser_json;
   
// Change root node to new QA space
    var json = JSON.stringify({ [SPACEQA] : spaceDefinition[SPACE]});
    // console.log(json);

//    Write the space details to the file to be consumed by deploy later.
    await fs.writeFile(NEW_SPACE_DEFINITION_FILE, json, 'utf-8');

    console.log('MAIN after executing commands');

    await browser.close();
})();
