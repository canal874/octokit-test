import { Octokit as OctokitRest } from '@octokit/rest';
import { OctokitResponse, ReposGetCommitResponseData } from '@octokit/types';
import { resolve } from 'dns';
import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import * as path from 'path';


const configPath = path.join(__dirname, `../config.json`);
console.debug(configPath);
const config = JSON.parse(readFileSync(configPath).toLocaleString());

const octokitRest = new OctokitRest({
    auth: config.auth,
});

const gitInfo = {
    owner: config.owner,
    repo: config.repo,
};

const targetContentID = config.targetID;

const getCurrentDate = () => {
    return new Date().toISOString().replace(/^(.+?)T(.+?)\..+?$/, '$1 $2');
};

const lastDate = '2020-10-01T00:00:00Z';
const getUpdatedFiles = async () => {
    const commitList = await octokitRest.repos.listCommits({
        ...gitInfo,
        since: lastDate
    }).catch(err => {
        console.dir(err);
    });
    if (!commitList) {
        return;
    }
    // console.dir(commits.data);
    const getters: Promise<OctokitResponse<ReposGetCommitResponseData>>[] = [];

    commitList.data.forEach(commit => {
        const getter = (sha: string) =>
            // [getCommit API] https://github.com/octokit/plugin-rest-endpoint-methods.js/blob/5819d6ad02e18a31dbb50aab55d5d9411928ad3f/docs/repos/getCommit.md
            octokitRest.repos.getCommit({
                ...gitInfo,
                ref: sha,
            });
        getters.push(getter(commit.sha));
    });
    const detailedCommits = await Promise.all(getters).catch(err => console.dir(err));
    if (!detailedCommits) {
        return;
    }
    const contents = detailedCommits.map(commit => {
        const patch = commit.data.files[0].patch;
        const res = patch.match(/^\+({.+})$/m);
        if (res) {
            return res[1];
        }
        else{
            return ''
        }
    }).filter(content => content !== '');
    console.dir(contents);
};
getUpdatedFiles();


const crud = async () => {
    /**
     * Get blob
     */
    const content = await octokitRest.repos.getContent({
        ...gitInfo,
        path: targetContentID,
    }).catch(err => {
        console.dir(err);
    });
    if (!content) {
        return;
    }
    /**
     * Update blob and Commit
     */
    const targetContent = Buffer.from(content.data.content, content.data.encoding as any).toString();
    const sha = content.data.sha;
    console.debug(targetContent);
    const targetObj = JSON.parse(targetContent);
    targetObj['modifiedDate'] = getCurrentDate();
    const updatedContent = JSON.stringify(targetObj);

    const resultUpdate = await octokitRest.repos.createOrUpdateFileContents({
        ...gitInfo,
        path: targetContentID,
        message: 'Updated by rxdesktop',
        content: Buffer.from(updatedContent).toString('base64'),
        sha: sha,
    }).catch(err => {
        console.dir(err);
    });

    console.dir(resultUpdate);


    /**
     * Create blob and Commit
     */
    const newID = 'c' + nanoid() + '.json';
    const newContent = JSON.stringify({
        "id": newID,
        "title": "Item-" + getCurrentDate(),
        "completed": false,
        "modifiedDate": getCurrentDate(),
        "deleted": false
    });
    const resultCreate = await octokitRest.repos.createOrUpdateFileContents({
        ...gitInfo,
        path: newID,
        message: 'Created by rxdesktop',
        content: Buffer.from(newContent).toString('base64'),
    }).catch(err => {
        console.dir(err);
    });

    console.dir(resultCreate);

};

crud();
