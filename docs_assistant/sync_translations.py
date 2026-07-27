#!/usr/bin/env python3
"""
同步自动翻译文档的删除和重命名。
"""

import logging
import os
import shutil
import subprocess
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = REPO_ROOT / 'docs/docs'
DOCS_REPO_PREFIX = DOCS_DIR.relative_to(REPO_ROOT).as_posix()
LANGUAGES = ('en', 'ja')
TRANSLATE_DIFF_BASE = os.environ.get('TRANSLATE_DIFF_BASE', 'HEAD~1')
TRANSLATE_DIFF_HEAD = os.environ.get('TRANSLATE_DIFF_HEAD', 'HEAD')


def is_source_doc_repo_path(repo_path: str) -> bool:
    """Return True when the repository-relative path points at a source Markdown doc."""
    if not repo_path.endswith('.md'):
        return False

    prefix = f'{DOCS_REPO_PREFIX}/'
    if not repo_path.startswith(prefix):
        return False

    relative_path = repo_path[len(prefix):]
    return not any(
        relative_path == language or relative_path.startswith(f'{language}/')
        for language in LANGUAGES
    )


def get_translation_targets(source_repo_path: str) -> dict[str, Path]:
    """Map a source repository-relative path to translated target files."""
    relative_path = Path(source_repo_path[len(f'{DOCS_REPO_PREFIX}/'):])
    return {
        language: DOCS_DIR / language / relative_path
        for language in LANGUAGES
    }


def prune_empty_parent_dirs(path: Path):
    """Delete empty directories up to the language root."""
    current = path.parent

    while current != DOCS_DIR and current.parent != DOCS_DIR:
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent


def remove_translation_file(target_file: Path):
    """Delete a translated doc when it exists."""
    if not target_file.exists():
        return

    target_file.unlink()
    prune_empty_parent_dirs(target_file)
    logger.info("🗑️ 已删除译文: %s", target_file)


def move_translation_file(old_target: Path, new_target: Path):
    """Move a translated doc to its renamed location when possible."""
    if not old_target.exists():
        return

    if new_target.exists():
        old_target.unlink()
        prune_empty_parent_dirs(old_target)
        logger.info("♻️ 跳过移动并清理旧译文（新路径已存在）: %s -> %s", old_target, new_target)
        return

    new_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(old_target), str(new_target))
    prune_empty_parent_dirs(old_target)
    logger.info("🚚 已移动译文: %s -> %s", old_target, new_target)


def read_source_doc_changes() -> list[tuple[str, str, str | None]]:
    """Read source-doc delete and rename operations from the configured diff range."""
    result = subprocess.run(
        [
            'git',
            'diff',
            '--name-status',
            '--find-renames',
            TRANSLATE_DIFF_BASE,
            TRANSLATE_DIFF_HEAD,
            '--',
            DOCS_REPO_PREFIX,
        ],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"读取文档 diff 失败: {result.stderr.strip() or result.returncode}"
        )

    changes: list[tuple[str, str, str | None]] = []
    for raw_line in result.stdout.splitlines():
        parts = raw_line.split('\t')
        if not parts:
            continue

        status = parts[0]

        if status == 'D' and len(parts) >= 2:
            source_path = parts[1]
            if is_source_doc_repo_path(source_path):
                changes.append(('delete', source_path, None))
            continue

        if status.startswith('R') and len(parts) >= 3:
            old_path = parts[1]
            new_path = parts[2]
            old_is_source = is_source_doc_repo_path(old_path)
            new_is_source = is_source_doc_repo_path(new_path)

            if old_is_source and new_is_source:
                changes.append(('rename', old_path, new_path))
            elif old_is_source:
                changes.append(('delete', old_path, None))

    return changes


def main():
    changes = read_source_doc_changes()

    if not changes:
        logger.info("没有需要同步的译文删除或重命名")
        return

    logger.info("检测到 %s 个需要同步的译文变更", len(changes))

    for change_type, old_path, new_path in changes:
        old_targets = get_translation_targets(old_path)

        if change_type == 'delete':
            for target_file in old_targets.values():
                remove_translation_file(target_file)
            continue

        new_targets = get_translation_targets(new_path or old_path)
        for language in LANGUAGES:
            move_translation_file(old_targets[language], new_targets[language])

    logger.info("✅ 译文同步完成")


if __name__ == '__main__':
    main()
