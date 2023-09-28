********** CICD Automation Pipeline Repo Datasphere ****************

Refer to the following blogs
> This repo is part of a blog series on SAP Datasphere and SAP HANA Cloud CI/CD. 
>1. [SAP Datasphere SAP HANA Cloud HDI CI/CD Automation Approach](https://blogs.sap.com/2022/10/10/sap-data-warehouse-cloud-sap-hana-cloud-hdi-ci-cd-automation-approach/)
>2. [SAP Datasphere SAP HANA Cloud HDI Automation CI/CD Pipelines Details](https://blogs.sap.com/2022/10/11/sap-data-warehouse-cloud-sap-hana-cloud-hdi-automation-ci-cd-pipelines-details/)

recap pipeline flow and transport landscape setup. 

**Figure (a) depicts the transport landscape.** 

![image](https://media.github.tools.sap/user/11116/files/b4e65f53-669c-4f4e-af93-630dae03924f)
**Figure (b) Automation flow**

Figure (b) outlines the automation flow; two pipelines are linked to two separate GIT repos for the HDI container and SAP Datasphere artifacts. The flow can either start from the HDI container pipeline or the SAP Datasphere pipeline. Suppose it involves committing HDI container artifacts via VS code or Business Application Studio. Webhook will trigger the HDI pipeline to build, deploy, validate, and upload MTA archives to SAP Cloud Transport Management. SAP Cloud Transport Management will move the MTA archives through the landscape. If all the earlier steps are successful, it will trigger the SAP Datasphere pipeline. SAP Datasphere pipeline flows through the build, deploy and validation of SAP Datasphere artifacts, deploying them into QA space.

And this repo is for pipeline 2
![image](https://media.github.tools.sap/user/11116/files/2723dd79-2e2f-4636-a3db-0f43a4b45a3c)

Pipeline 2 – SAP Datasphere Pipeline
SAP Datasphere pipeline Jenkinsfile and config.yml are as below. Prepare step is used to checkout code from source control, and initialize Piper commonPipelineEnviroment. Build and deploy steps call Build.js and Deploy.js nodeJS files, respectively. The parameters for the Build and Deploy steps come from config.xml except for the SAP Datasphere login credential, which is stored as a secret in Jenkins and passed using the withCredentials module. This would mask the credentials field even in the build server logs.  As shown in the Dockerfile code below, a custom docker image is used to ensure all the dependencies are met. And the Build.js is called inside the docker container. Please refer to the comments inside the Dockerfile on how to build the docker image.

**Jenkinsfile:**

```bash
@Library('piper-lib-os') _

node() {

    stage('prepare') {
        deleteDir()
        checkout scm
        setupCommonPipelineEnvironment script: this
        verbose: true
    }

    stage('build') {
        withCredentials([
        usernamePassword(credentialsId: "DWC_CredentialsID",
        usernameVariable: 'DWC_USER',
        passwordVariable: 'DWC_PASS')
        ])
        {
            dockerExecute(
                script: this, 
                dockerImage: 'vishwagi/puppeteer-dwc-node-docker:latest',
                dockerEnvVars: ['DWC_PASS':'$DWC_PASS','DWC_USER':'$DWC_USER',])
                {
                sh 'node Build.js';
                }
                verbose: true    
        }            
    }

    stage('deploy') {

        withCredentials([
        usernamePassword(credentialsId: "DWC_CredentialsID",
        usernameVariable: 'DWC_USER',
        passwordVariable: 'DWC_PASS')
        ])
        {
            dockerExecute(
                script: this, 
                dockerImage: 'vishwagi/puppeteer-dwc-node-docker:latest',
                dockerEnvVars: ['DWC_PASS':'$DWC_PASS','DWC_USER':'$DWC_USER',])
                {
                sh 'node Deploy.js';
                }
                verbose: true    
        }
    }
    stage('Validation') {
        npmExecuteScripts script: this,
        verbose: true
    }

}
```

**pipeline/config.yml**
```bash
steps:
  ###  Stage Build and Deploy set env variables
  dockerExecute:
    dockerEnvVars:
      DWC_URL: 'https://dwc-ab-abcd.eu10.hcs.cloud.sap/'
      DWC_PASSCODE_URL: 'https://dwc-ab-abcd.authentication.eu10.hana.ondemand.com/passcode'
      HDIDEV: 'SP_PROJECTDEV_DWC_HDI'
      HDIQA: 'SP_PROJECT_QA_DWC_HDI'
      SPACE: 'SP_PROJECTDEV'
      SPACEQA: 'SP_PROJECTQA'
      LABELQA: 'DWC_QA'
      ENTITIES: ''
      SPACE_DEFINITION_FILE: 'SP_PROJECTDEV.json'
      NEW_SPACE_DEFINITION_FILE:  'SP_PROJECTQA.json'

  ###  Stage Validation, Execute npm script 'test' to validate db artifacts.
  npmExecuteScripts:
    buildDescriptorList:
      - srv/package.json
    runScripts: 
      - "test"
```
**Dockerfile**
```bash
FROM geekykaran/headless-chrome-node-docker:latest

LABEL version="1.0"
LABEL author = "Vishwa Gopalkrishna"

RUN apt update; \
    apt upgrade;

RUN npm cache clean -f; \
    npm install n -g; \
    n stable; 
ADD package.json package-lock.json /

# The steps below are to enhance Docker image
# otherwise the image from Docker Hub can be used as is.
# open terminal in the same folder as Dockerfile and run below
# Command #1 to create package.json file.
# npm init --yes 

# Command #2 install dependencies, these would be written in package.json file
# npm install @sap/dwc-cli fs-extra puppeteer path
#  Now if you check the package.json and package-lock.json you should see the dependency list.

RUN npm install

# #3 Build command
# docker build -t vishwagi/puppeteer-dwc-node-docker:latest .


# Version 1.0 image has below packages
# ***IMPORTANT other @sap/dwc-cli version may need changes to Build.js 
#        "@sap/dwc-cli": "^2022.14.0",
#        "fs-extra": "^10.1.0",
#        "path": "^0.12.7",
#        "puppeteer": "^15.3.0"

```
Build.js and Deploy.js files are nodeJS files wrapped around @sap/dwc-cli commands. Both these modules use a headless chromium browser for automated passcode retrieval (puppeteer). Please refer to Jascha Kanngiesser’s dwc-cli blog post explaining the passcode retrieval details. With SAP Datasphere’s latest version, there is support for OAuth authentication, which should simplify the Build.js even further. I’ll write a follow-on blog updating the Build and Deploy JS files with OAuth authentication, keep a look out for my updates here.

Functionality-wise, Build.js downloads the DEV space entities to a file parses it to translate them to QA space entities, changing the relevant parameters like the label, mapped HDI name, DB user etc. And Deploy.js updates/creates the QA space with appropriate entity changes. The parameters from config.yml and secrets are retrieved as environment parameters.

**Build.js**
```bash
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
```
** Deploy.js**

```bash
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
})();
```
