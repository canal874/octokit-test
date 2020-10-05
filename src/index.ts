import { Octokit } from '@octokit/rest';
import { OctokitResponse, ReposCreateOrUpdateFileContentsResponse201Data, ReposCreateOrUpdateFileContentsResponseData, ReposGetCommitResponseData } from '@octokit/types';
import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import * as path from 'path';


const configPath = path.join(__dirname, `../config.json`);
console.debug(configPath);
const config = JSON.parse(readFileSync(configPath).toLocaleString());

const gitInfo = {
    owner: config.owner,
    repo: config.repo,
};

const octokit = new Octokit({
    auth: config.auth,
});

const contentTemplate = { "title": "First Item", "completed": false, "modifiedDate": "2020-10-02 05:32:38", "deleted": false };

const targetContentID = config.targetID;

const getCurrentDate = () => {
    return new Date().toISOString().replace(/^(.+?)T(.+?)\..+?$/, '$1 $2');
};

const lastDate = '2020-10-01T00:00:00Z';

const getUpdatedFiles = async () => {
    // Pagenation arranges page from new commits (page 1) to old commits (last page).
    // The last page cannot be got until calling listCommits once.
    // So there is no method to get last page by one pass interaction.
    /* 
    const commitList = await octokitRest.repos.listCommits({
        ...gitInfo,
        since: lastDate,
        //        per_page: 5,
        //        page: 1
    }).catch(err => {
        console.dir(err);
    });
    if (!commitList) {
        return;
    }
    */
    // GraphQL API returns minimum data while REST API returns more informative data
    const repos: any = await octokit.graphql(`
        {
            repository(owner: "${gitInfo.owner}", name: "${gitInfo.repo}") {
                defaultBranchRef {
                    target {
                        ... on Commit {
                            history(since: "2020-10-01T00:00:00") {
                                nodes {
                                    oid
                                }
                            }
                        }
                    }
                }
            }
        }
        `
    ).catch(err => {
        console.dir(err);
    });
    console.dir(repos);
    const commitList: { "oid": string }[] = repos.repository.defaultBranchRef.target.history.nodes;

    console.dir(commitList);
    
    const getters: Promise<OctokitResponse<ReposGetCommitResponseData>>[] = [];

    commitList.forEach(commit => {
        const getter = (sha: string) =>
            // [getCommit API] https://github.com/octokit/plugin-rest-endpoint-methods.js/blob/5819d6ad02e18a31dbb50aab55d5d9411928ad3f/docs/repos/getCommit.md
            octokit.repos.getCommit({
                ...gitInfo,
                ref: sha,
            });
        getters.push(getter(commit.oid));
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

    /**
     * Retry to get SHA and commit if conflict
     */
};


const cacheOfContentSHA = new Map();

const update = async (id: string) => {
    let trialCount = 0;
    const getAndUpdateContent = async () => {
        trialCount++;
        console.debug('Trial: ' + trialCount);
        /**
         * 1. Get SHA of blob by using id
         */
        let oldSHA = cacheOfContentSHA.get(id);
        if (!oldSHA) {
            const oldContentResult = await octokit.repos.getContent({
                ...gitInfo,
                path: id,
            }).catch(err => {
                return err;
            });
            oldSHA = oldContentResult.data.sha;

            // const oldContent = Buffer.from(oldContentResult.data.content, oldContentResult.data.encoding as any).toString();
            // console.debug('[old content] ' + oldContent);        
        }
        console.log('old sha: ' + oldSHA);
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
        const result = await octokit.repos.createOrUpdateFileContents({
            ...gitInfo,
            path: targetContentID,
            message: config.messageUpdated,
            content: Buffer.from(updatedContent).toString('base64'),
            sha: oldSHA,
        }).catch(err => {
            return err;
        });

        console.debug('[update result]');        
        console.dir(result);        
        return result;
    };

    /**
     * 3. Retry to get SHA and commit if conflict
     */
    let updatedContentResult: OctokitResponse<ReposCreateOrUpdateFileContentsResponseData | ReposCreateOrUpdateFileContentsResponse201Data> | void;
    let retry = false;
    do {
        updatedContentResult = await getAndUpdateContent().catch(err => console.debug(err));
        retry = false;
        if (!updatedContentResult){
            // Network error?
        }
        else if(updatedContentResult.status === 403) {
            if(updatedContentResult.headers["x-ratelimit-remaining"] && updatedContentResult.headers["x-ratelimit-remaining"] === '0'){
                // Reach rate limit
            }
/*            else if(){
                // Abuse limit
            } */
            else {
                // Other

            }
        }
        else if(updatedContentResult.status === 409) {        
            // HttpError: 409 Conflict
            // Remove cache to get SHA again
            cacheOfContentSHA.delete(id);
            retry = true;
        }

        console.debug('retry: ' + retry);
    } while(retry);

    /**
     * 4. Cache SHA of new blob
     */
    if(updatedContentResult){
        const updatedSHA = updatedContentResult.data.content.sha;
        console.debug('updated sha: ' + updatedSHA);

        // SHA should be cached to reduce API requests
        cacheOfContentSHA.set(id, updatedSHA);
    }
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
    const resultCreate = await octokit.repos.createOrUpdateFileContents({
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
    getUpdatedFiles();

//    await update(config.targetID);
//    await update(config.targetID);
    
    // create();
}

test();
