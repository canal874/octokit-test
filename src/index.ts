import { Octokit as OctokitRest } from '@octokit/rest';
import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import * as path from 'path';


const configPath = path.join(__dirname, `../config.json`);
console.debug(configPath);
const config = JSON.parse(readFileSync(configPath).toLocaleString());

const octokitRest = new OctokitRest({
    auth: config.auth
});

const gitInfo = {
    owner: config.owner,
    repo: config.repo,
    ref: config.ref,
};

const targetContentID = config.targetID;

const getCurrentDate = () => {
    return new Date().toISOString().replace(/^(.+?)T(.+?)\..+?$/, '$1 $2');
};

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
        message: 'Updated by rxdesktop',
        content: Buffer.from(newContent).toString('base64'),
    }).catch(err => {
        console.dir(err);
    });

    console.dir(resultCreate);

};

crud();
