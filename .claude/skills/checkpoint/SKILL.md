---
name: checkpoint
description: Stage all changes in this repo and commit them as a checkpoint, with an optional label. Use when the user runs /checkpoint or asks to "save a checkpoint" / "commit progress so far".
---

# Checkpoint

Save current progress as a git commit, without needing a hand-crafted commit message each time.

## Steps

1. Run `git status` in the repo root to see what would be committed. If there are no
   staged or unstaged changes and no untracked files, report that there's nothing to
   checkpoint and stop — do not create an empty commit.
2. Stage everything: `git add -A`.
3. Determine the commit message:
   - If the user gave a label (e.g. `/checkpoint backend skeleton working`), use
     `checkpoint: <label>`.
   - If no label was given, use `checkpoint: <UTC timestamp, e.g. 2026-08-13T14:05:00Z>`.
4. Commit: `git commit -m "<message>"`.
5. Report back concisely: the commit message used and a one-line summary of what was
   included (e.g. from `git show --stat HEAD` or the `git status` output from step 1) —
   don't just say "done", show what actually got committed.

## Notes

- This is a plain `git add -A && git commit` workflow — no interactive rebase, no
  force-push, nothing destructive. It only touches the local repo.
- Don't push automatically; checkpointing is a local save point, not a publish step.
- Follow the repo's existing git safety practices (see the top-level agent
  instructions) — e.g. never skip hooks, never amend an existing commit here.
