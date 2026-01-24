# Deployment Checklist

Quick reference checklist for deploying Lifeline Mesh to GitHub Pages.

## Pre-Deployment

### Code Quality
- [x] All crypto tests passing (14/14)
- [x] All test vector validations passing (23/23)
- [x] No linter errors
- [x] No secrets in code
- [x] SRI hashes added to CDN scripts

### Documentation
- [x] USAGE.md complete
- [x] FAQ.md complete
- [x] THREAT_MODEL.md complete
- [x] PROTOCOL.md complete
- [x] README.md updated
- [x] CONTRIBUTING.md present
- [x] SECURITY.md present
- [x] LICENSE present (MIT)

### Repository
- [x] All changes committed
- [x] All changes pushed to branch
- [x] .gitignore configured
- [x] GitHub Pages workflow file exists

## Deployment Steps

### Step 1: Create PR
- [ ] Visit PR creation URL
- [ ] Add comprehensive title
- [ ] Copy PR description from `.github/PR_DESCRIPTION.md`
- [ ] Create pull request

### Step 2: Merge
- [ ] Review PR (no conflicts, all checks pass)
- [ ] Merge PR (squash recommended)
- [ ] Delete feature branch (optional)

### Step 3: Configure GitHub Pages (First Time)
- [ ] Go to Settings → Pages
- [ ] Set Source to "GitHub Actions"
- [ ] Save settings

### Step 4: Wait for Deployment
- [ ] Go to Actions tab
- [ ] Wait for "Deploy Pages" workflow (1-2 min)
- [ ] Verify green checkmark

### Step 5: Verify Live Site
- [ ] Visit deployed URL
- [ ] Test key generation
- [ ] Test export/import
- [ ] Test encryption/decryption
- [ ] Check browser console (no SRI errors)

## Post-Deployment

### Testing
- [ ] Desktop Chrome/Edge
- [ ] Desktop Firefox
- [ ] Desktop Safari
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

### Documentation
- [ ] All links work on deployed site
- [ ] README has live demo link
- [ ] Repository description updated
- [ ] Topics added (cryptography, e2ee, emergency, mesh)

### Monitoring
- [ ] Check Actions tab for workflow status
- [ ] Check Deployments section
- [ ] Monitor for issues/bug reports

### Communication
- [ ] Announce deployment (if applicable)
- [ ] Update project roadmap
- [ ] Document known issues (if any)

## Rollback Plan

If deployment fails:
- [ ] Identify issue from Actions logs
- [ ] Revert problematic commit
- [ ] Or: redeploy previous working version
- [ ] Monitor Actions for successful redeployment

## Security Final Check

- [ ] SRI integrity verified
- [ ] HTTPS enforced (GitHub Pages default)
- [ ] No secrets exposed in repo
- [ ] Security policy visible
- [ ] All tests passing
- [ ] Threat model published

## Success Criteria

All must be ✅ before announcing:
- [ ] Site loads without errors
- [ ] All core features work (keys, encrypt, decrypt, export, import)
- [ ] No console errors (except expected warnings)
- [ ] Documentation accessible
- [ ] Mobile-friendly
- [ ] SRI protection active

## Notes

- First deployment may take 5-10 minutes for DNS propagation
- Subsequent deployments are faster (1-2 minutes)
- Always test on multiple browsers/devices before announcing
- Keep this checklist for future updates

---

**Date**: ___________
**Deployed by**: ___________
**Deployment URL**: https://hiroshitanaka-creator.github.io/lifeline-mesh/
**Status**: ⬜ Pending | ⬜ In Progress | ⬜ Complete | ⬜ Failed
