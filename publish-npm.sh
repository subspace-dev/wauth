#! /bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# Print beautiful header
printf "${BOLD}${CYAN}==============================\n"
printf "        PUBLISHING SDK      \n"
printf "==============================${RESET}\n"

npm run publish:sdk

# wait 15 seconds to make sure the package is published
printf "${YELLOW}Waiting 15 seconds for package to publish...${RESET}\n"
sleep 15

# install the latest package in the strategy
cd strategy
printf "${BOLD}${BLUE}Installing SDK in Strategy${RESET}\n"
npm i @wauth/sdk@latest
npm run build

cd ..

printf "${BOLD}${CYAN}==============================\n"
printf "      PUBLISHING STRATEGY     \n"
printf "==============================${RESET}\n"
npm run publish:strategy

printf "${GREEN}${BOLD}Published successfully!${RESET}\n"

git reset --hard

printf "${BOLD}${CYAN}Done!${RESET}\n"