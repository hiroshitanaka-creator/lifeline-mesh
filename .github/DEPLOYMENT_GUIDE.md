# Deployment Guide

Complete guide for deploying Lifeline Mesh to GitHub Pages.

## Prerequisites

- ✅ All changes committed to `claude/setup-repo-structure-KrAbA` branch
- ✅ All tests passing (crypto: 14/14, vectors: 23/23)
- ✅ GitHub Pages workflow file exists (`.github/workflows/pages.yml`)

## Step 1: Create Pull Request

### 1.1 Navigate to PR Creation
Visit: **https://github.com/hiroshitanaka-creator/lifeline-mesh/pull/new/claude/setup-repo-structure-KrAbA**

### 1.2 Fill PR Details

**Title:**
```
Complete Lifeline Mesh implementation: Modular crypto, docs, and security
```

**Description:**
Copy content from `.github/PR_DESCRIPTION.md` or use this summary:

```markdown
## What
Complete implementation with modular architecture, comprehensive documentation, and production-ready security.

## Key Changes
- ✅ Crypto core module (14 tests passing)
- ✅ Test vectors + validator (23 tests passing)
- ✅ Complete docs (USAGE, FAQ, THREAT_MODEL, PROTOCOL)
- ✅ Key export/import feature
- ✅ SRI for CDN dependencies

## Tests
- Crypto: 14/14 ✓
- Vectors: 23/23 ✓
- Manual UI: ✓

## Security
- [x] SRI added to all CDN scripts
- [x] All crypto tests passing
- [x] Protocol documented
- [x] Threat model complete
```

### 1.3 Create PR
Click **"Create pull request"**

## Step 2: Review and Merge

### 2.1 Pre-merge Checklist
- [ ] All CI checks passing (if configured)
- [ ] No merge conflicts
- [ ] Review PR description for accuracy

### 2.2 Merge PR
1. Click **"Merge pull request"**
2. Select merge method: **"Create a merge commit"** or **"Squash and merge"** (recommended)
3. Confirm merge
4. **Delete branch** `claude/setup-repo-structure-KrAbA` (optional but recommended)

## Step 3: Configure GitHub Pages (First Time Only)

### 3.1 Navigate to Settings
1. Go to repository: **https://github.com/hiroshitanaka-creator/lifeline-mesh**
2. Click **"Settings"** tab (top right)

### 3.2 Enable GitHub Pages
1. In left sidebar, click **"Pages"**
2. Under **"Source"** section:
   - Select **"GitHub Actions"** from dropdown
   - (If dropdown not visible, it may auto-detect the workflow)
3. Page will auto-save

### 3.3 Wait for Deployment
1. Go to **"Actions"** tab
2. Find workflow run: **"Deploy Pages"**
3. Wait for green checkmark (typically 1-2 minutes)

### 3.4 Verify Deployment
1. Return to **Settings → Pages**
2. You should see: **"Your site is live at https://hiroshitanaka-creator.github.io/lifeline-mesh/"**
3. Click the URL to visit deployed site

## Step 4: Post-Deployment Verification

### 4.1 Test Deployed Site
Visit: **https://hiroshitanaka-creator.github.io/lifeline-mesh/**

**Manual Tests**:
1. **Keys**: Click "🔑 Generate / Load Keys"
   - ✓ Keys should generate and display
   - ✓ Fingerprint should appear

2. **Export/Import**:
   - ✓ Click "💾 Export Keys", enter password, download file
   - ✓ Click "🗑️ RESET ALL", confirm
   - ✓ Click "📥 Import Keys", select file, enter password
   - ✓ Keys should restore

3. **Contact Management**:
   - ✓ Copy your Public ID
   - ✓ Open in new incognito window, generate new keys
   - ✓ Exchange Public IDs between windows
   - ✓ Add contact in both windows

4. **Encryption**:
   - ✓ Type message in window A
   - ✓ Select contact, click "🔒 Encrypt"
   - ✓ Copy encrypted JSON
   - ✓ Paste in window B, click "🔓 Decrypt"
   - ✓ Message should decrypt correctly

5. **SRI Verification**:
   - ✓ Open browser DevTools (F12)
   - ✓ Check Console tab
   - ✓ Verify NO errors like "Failed to find a valid digest in the 'integrity' attribute"

### 4.2 Browser Compatibility
Test on:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### 4.3 Documentation Links
Verify all links work:
- [ ] USAGE.md opens in new tab
- [ ] FAQ.md opens in new tab
- [ ] THREAT_MODEL.md opens in new tab
- [ ] PROTOCOL.md opens in new tab

## Step 5: Optional Enhancements

### 5.1 Custom Domain (Optional)
If you have a custom domain:

1. **Settings → Pages → Custom domain**
2. Enter your domain (e.g., `lifeline-mesh.example.com`)
3. **Add CNAME record** in your DNS:
   ```
   CNAME lifeline-mesh.example.com → hiroshitanaka-creator.github.io
   ```
4. Wait for DNS propagation (5-30 minutes)
5. Check **"Enforce HTTPS"** (after DNS propagation)

### 5.2 Update README
Add live demo link to main README.md:

```markdown
## Live Demo

Try the deployed version: **https://hiroshitanaka-creator.github.io/lifeline-mesh/**

(Or your custom domain if configured)
```

### 5.3 Add to Repository Description
1. Go to repository main page
2. Click ⚙️ (gear icon) next to "About"
3. **Website**: `https://hiroshitanaka-creator.github.io/lifeline-mesh/`
4. **Description**: "End-to-end encrypted emergency messaging • Offline-first • No server required"
5. **Topics**: `cryptography`, `encryption`, `emergency`, `mesh-network`, `e2ee`
6. Save

## Troubleshooting

### Issue: Workflow Not Running
**Symptom**: No workflow run in Actions tab after merge

**Solution**:
1. Check `.github/workflows/pages.yml` exists in main branch
2. Verify workflow file syntax (YAML validation)
3. Check if Actions are enabled: **Settings → Actions → General → "Allow all actions"**

### Issue: 404 Page Not Found
**Symptom**: Deployed URL shows 404

**Solution**:
1. Verify GitHub Pages source is set to "GitHub Actions"
2. Check workflow completed successfully (green checkmark)
3. Wait 5 minutes and refresh (DNS propagation)
4. Check `app/index.html` exists in main branch

### Issue: SRI Integrity Error
**Symptom**: Console shows "Failed to find a valid digest in the 'integrity' attribute"

**Solution**:
1. CDN file may have changed - regenerate SRI:
   ```bash
   cd tools
   npm run generate-sri
   ```
2. Update `app/index.html` with new hashes
3. Commit and push

### Issue: Module Not Found (crypto/core.js)
**Symptom**: Console shows "Failed to load module script"

**Solution**:
1. Verify `/crypto/core.js` exists in deployed branch
2. Check file path is correct: `../crypto/core.js` (relative to `/app/index.html`)
3. Verify MIME type is `text/javascript` (GitHub Pages should handle this automatically)

### Issue: IndexedDB Not Working
**Symptom**: "Keys not loading" or "Database error"

**Solution**:
1. Check browser compatibility (IndexedDB required)
2. Verify not in private/incognito mode (some browsers disable IndexedDB)
3. Clear browser storage: DevTools → Application → Clear storage
4. Try different browser

## Rollback Procedure

If deployment breaks:

1. **Revert commit**:
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Or redeploy previous version**:
   - Find last working commit SHA
   - `git reset --hard <commit-sha>`
   - `git push --force origin main` (⚠️ use with caution)

3. **Wait for workflow** to redeploy

## Monitoring

### Check Deployment Status
- **Actions tab**: https://github.com/hiroshitanaka-creator/lifeline-mesh/actions
- **Deployments**: https://github.com/hiroshitanaka-creator/lifeline-mesh/deployments

### Analytics (Optional)
Consider adding:
- Google Analytics
- Plausible Analytics (privacy-friendly)
- Simple counter (e.g., GoatCounter)

## Security Checklist

Before announcing to users:
- [ ] SRI hashes verified for all CDN scripts
- [ ] All tests passing
- [ ] Documentation reviewed
- [ ] Threat model published
- [ ] Security policy (SECURITY.md) visible
- [ ] No secrets in repository (check commit history)
- [ ] HTTPS enforced (GitHub Pages default)

## Success Criteria

Deployment is successful when:
- ✅ Site loads at GitHub Pages URL
- ✅ Keys can be generated
- ✅ Export/import works
- ✅ Encryption/decryption works end-to-end
- ✅ No browser console errors (except expected TOFU warnings)
- ✅ SRI integrity checks pass
- ✅ All documentation links work

## Next Steps

After successful deployment:
1. Announce on social media / project channels
2. Add to relevant directories (awesome lists, etc.)
3. Monitor for issues / feedback
4. Plan future enhancements (see PROJECT_CHARTER.md)

## Support

For deployment issues:
- Open issue: https://github.com/hiroshitanaka-creator/lifeline-mesh/issues
- Check documentation: `/docs/FAQ.md`
- Review workflow logs: Actions tab
