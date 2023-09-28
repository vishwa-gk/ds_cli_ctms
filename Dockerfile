FROM geekykaran/headless-chrome-node-docker:latest

LABEL author = "Vishwa Gopalkrishna"

RUN apt update; \
    apt upgrade;

RUN npm cache clean -f; \
    npm install n -g; \
    n stable; 

# Install Puppeteer under /node_modules so it's available system-wide
ADD package.json package-lock.json /
# open terminal in the same folder as Dockerfile and run below
# Command 1 to create package.json file.
# npm init --yes 
# Command 2 install dependencies, these would be written in package.json file
# npm install @sap/dwc-cli fs-extra puppeteer path
#  Now if you check the package.jso and package-lock.json you should see the dependency list.
RUN npm install


# Build command 
# docker build -t vishwagi/puppeteer-dwc-node-docker:latest .