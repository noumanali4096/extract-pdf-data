#!/usr/bin/env bash
set -o errexit

# Install Chromium for Puppeteer
apt-get update
apt-get install -y chromium

npm install