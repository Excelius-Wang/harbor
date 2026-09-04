# Publish refreshed Harbor README

## Goal

Publish the completed English and Simplified Chinese README refresh to the default branch of
`Excelius-Wang/harbor`. Done means GitHub `main` contains both new files and the repository front
page renders the refreshed README.

## Current state

[PR #28](https://github.com/Excelius-Wang/harbor/pull/28) squash-merged the refreshed `README.md`
and `README.zh-CN.md` into `main` as `e45cb0c1a027422f61a1a565d80d03039edfe625`. GitHub's Contents
API returns blob `729dd81c` for the English README and `5858835a` for the Simplified Chinese README.
The public repository page renders the new “Your GitHub work, finally in one calm desktop
workspace.” headline, screenshot, badges, feature overview, and setup instructions.

Prettier and `git diff --check` passed before publication. CodeQL Actions and JavaScript/TypeScript
checks passed; the non-required Rust analysis was still running when GitHub accepted the merge. The
remote feature branch, local feature branch, and temporary publish worktree are removed. The primary
recovery worktree and its unrelated uncommitted changes remain intact.

## Next action

None — complete

## Verification

```bash
gh pr view 28 --repo Excelius-Wang/harbor --json state,mergedAt,mergeCommit,url
gh api repos/Excelius-Wang/harbor/contents/README.md --jq '.sha'
gh api repos/Excelius-Wang/harbor/contents/README.zh-CN.md --jq '.sha'
```

Success: PR #28 is merged, `origin/main` and GitHub's rendered repository page contain both refreshed
READMEs, and the feature branch and temporary worktree are removed.
