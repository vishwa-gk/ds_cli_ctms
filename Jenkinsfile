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
