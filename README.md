# BulkPublish for VS Code

Write, schedule and publish social media posts without leaving your editor, and
let Copilot chat use your BulkPublish account.

## Features

- **Compose posts.** Write a caption, pick your channels, attach an image or video
  from your workspace, then publish now, schedule it for a date and time in any
  time zone, or save it as a draft.
- **Live character counts** for each network you've picked, counted the way that
  network counts them (on X and Mastodon every link counts as 23 characters).
  A caption that is too long for any chosen network can't be sent until it fits.
- **See what will be skipped, and why**: a channel that needs reconnecting, an
  Instagram, Pinterest or Snapchat channel when there's no image, a TikTok or
  YouTube channel when there's no video.
- **Share from the editor.** Right-click selected text and choose *BulkPublish:
  Share selection*, or right-click a Markdown file and choose *BulkPublish: Share
  this file*. For Markdown, the caption starts from the front matter `title` and
  `description` (or the first heading) and the first image is attached.
- **Sidebar** with your connected channels and recent posts, each with its status.
  Hover a post to see how it went on each network; a failed post has a *Retry*
  button.
- **Copilot chat.** Once you've added your API key, BulkPublish's tools are
  available in Copilot agent mode, with nothing to configure.

## Getting started

1. In BulkPublish, go to **Settings → API Keys** and create a key.
2. In VS Code, open the BulkPublish view in the activity bar and choose
   **Set API key** (or run *BulkPublish: Set API key* from the Command Palette).
   The key is checked against your account before it's saved.
3. Click **+** in the BulkPublish view to write your first post.

Your API key is kept in VS Code's secure storage, never in your settings files.
*BulkPublish: Sign out* removes it from this editor.

## Using BulkPublish in Copilot chat

After you set your API key, open Copilot chat in agent mode and BulkPublish appears
in the tools list. Ask things like "schedule this changelog to LinkedIn for
Tuesday at 9am" or "which of my posts failed this week?". Signing out removes it
from chat too.

## Commands

| Command | What it does |
|---|---|
| BulkPublish: Set API key | Connect your BulkPublish account |
| BulkPublish: Sign out | Remove your API key from this editor |
| BulkPublish: New post | Open the compose form |
| BulkPublish: Share selection | Start a post from the selected text |
| BulkPublish: Share this file | Start a post from a Markdown file |
| BulkPublish: Refresh | Reload channels and posts |

## Good to know

- Channels are connected in BulkPublish itself; refresh the sidebar after adding one.
- Images and videos are sent from your computer; files on the web aren't fetched.
  If a Markdown file's first image is a web address, attach a local copy instead.
- If publishing fails, nothing is left behind: the post and its upload are removed
  so you can fix the problem and try again.

## Support

Questions or problems: [help.bulkpublish.com](https://help.bulkpublish.com) or the
chat on [bulkpublish.com](https://www.bulkpublish.com).
