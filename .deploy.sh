#!/bin/bash
git config --global user.name "Travis CI"
git config --global user.email "$COMMIT_AUTHOR_EMAIL"
chmod 600 deploy.key
mv deploy.key ~/.ssh/id_rsa
npm run deploy
