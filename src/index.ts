import { Octokit as OctokitRest } from '@octokit/rest';
import { OctokitResponse, ReposGetCommitResponseData } from '@octokit/types';
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

const contentTemplate = { "title": "First Item", "completed": false, "modifiedDate": "2020-10-02 05:32:38", "deleted": false };

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
        else {
            return ''
        }
    }).filter(content => content !== '');
    console.dir(contents);
};


const cacheOfContentSHA = new Map();

const update = async (id: string) => {
    /**
     * 1. Get SHA of blob by using id
     */
    let oldSHA = cacheOfContentSHA.get(id);
    if (!oldSHA) {
        const oldContentResult = await octokitRest.repos.getContent({
            ...gitInfo,
            path: id,
        }).catch(err => {
            console.dir(err);
        });
        if (!oldContentResult) {
            return;
        }
        oldSHA = oldContentResult.data.sha;

        // const oldContent = Buffer.from(oldContentResult.data.content, oldContentResult.data.encoding as any).toString();
        // console.debug('[old content] ' + oldContent);        
    }
    console.log(oldSHA);
    /**
     * 2. Update blob and Commit
     */
    const updatedObj = {
        ...contentTemplate,
        id: id,
        modifiedDate: getCurrentDate(),
    };
    const updatedContent = JSON.stringify(updatedObj);
    console.debug('[new content] ' + updatedContent);

    // [createOrUpdateFileContents API] https://github.com/octokit/plugin-rest-endpoint-methods.js/blob/5819d6ad02e18a31dbb50aab55d5d9411928ad3f/docs/repos/createOrUpdateFileContents.md
    const updatedContentResult = await octokitRest.repos.createOrUpdateFileContents({
        ...gitInfo,
        path: targetContentID,
        message: config.messageUpdated,
        content: Buffer.from(updatedContent).toString('base64'),
        sha: oldSHA,
    }).catch(err => {
        console.dir(err);
    });

    console.dir(updatedContentResult);

    if (!updatedContentResult) {
        return;
    }

    /**
     * 3. Retry to get SHA and commit if conflict
     */    


    /**
     * 4. Cache SHA of new blob
     */    
    const updatedSHA = updatedContentResult.data.content.sha;
    console.debug('updated sha: ' + updatedSHA);

    // SHA should be cached to reduce API requests
    cacheOfContentSHA.set(id, updatedSHA);
};

const create = async () => {
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
        message: config.messageCreated,
        content: Buffer.from(newContent).toString('base64'),
    }).catch(err => {
        console.dir(err);
    });

    console.dir(resultCreate);
}

const test = async () => {
    await update(config.targetID);
    await update(config.targetID);
    // getUpdatedFiles();
    // create();
}

test();
