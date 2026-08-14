#!/usr/bin/env python3
"""
检测缺失的翻译文件
比较中文源文档和翻译文档，找出还未翻译的文件
"""

import argparse
import logging
import os
import sys
import tempfile
from pathlib import Path

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 配置
DOCS_DIR = Path(__file__).parent.parent / 'docs/docs'
TARGET_LANGUAGES = ['en', 'ja']
OUTPUT_FILE = Path(
    os.environ.get('MISSING_FILES_OUTPUT', Path(tempfile.gettempdir()) / 'missing_files.txt')
)


def find_source_files():
    """查找所有中文源文档"""
    source_files = []
    
    for md_file in DOCS_DIR.rglob('*.md'):
        # 跳过翻译目录
        rel_path = md_file.relative_to(DOCS_DIR)
        if rel_path.parts and rel_path.parts[0] in TARGET_LANGUAGES:
            continue
        
        # 跳过 .gitkeep 等非文档文件
        if md_file.name.startswith('.'):
            continue
        
        source_files.append(md_file)
    
    return sorted(source_files)


def check_translation_exists(source_file: Path, language: str) -> bool:
    """检查指定语言的翻译文件是否存在"""
    rel_path = source_file.relative_to(DOCS_DIR)
    translated_file = DOCS_DIR / language / rel_path
    return (
        translated_file.is_file()
        and bool(translated_file.read_text(encoding="utf-8").strip())
    )


def find_missing_translations():
    """查找所有缺失的翻译"""
    logger.info("🔍 开始检测缺失的翻译文件...")
    logger.info(f"📁 文档目录: {DOCS_DIR}")
    logger.info(f"🌍 目标语言: {', '.join(TARGET_LANGUAGES)}")
    logger.info("-" * 60)
    
    # 获取所有源文件
    source_files = find_source_files()
    logger.info(f"📚 找到 {len(source_files)} 个中文源文档")
    
    # 检查每个语言的缺失文件
    missing_by_language = {lang: [] for lang in TARGET_LANGUAGES}
    all_missing_sources = set()
    
    for source_file in source_files:
        rel_path = source_file.relative_to(DOCS_DIR)
        has_missing = False
        
        for language in TARGET_LANGUAGES:
            if not check_translation_exists(source_file, language):
                missing_by_language[language].append(source_file)
                has_missing = True
        
        if has_missing:
            all_missing_sources.add(source_file)
    
    # 输出统计信息
    logger.info("\n📊 缺失翻译统计:")
    for language in TARGET_LANGUAGES:
        count = len(missing_by_language[language])
        logger.info(f"   {language.upper()}: {count} 个文件缺失")
    
    total_missing = len(all_missing_sources)
    logger.info(f"\n📝 共有 {total_missing} 个源文件需要翻译")
    
    # 输出详细列表
    if all_missing_sources:
        logger.info("\n📋 缺失翻译的文件列表:")
        for idx, source_file in enumerate(sorted(all_missing_sources), 1):
            rel_path = source_file.relative_to(DOCS_DIR)
            missing_langs = []
            for language in TARGET_LANGUAGES:
                if source_file in missing_by_language[language]:
                    missing_langs.append(language.upper())
            
            logger.info(f"   {idx:3d}. {rel_path} [{', '.join(missing_langs)}]")
    
    return sorted(all_missing_sources)


def save_missing_files(missing_files: list):
    """保存缺失文件列表到临时文件"""
    if not missing_files:
        logger.info("\n✅ 所有文档都已翻译完成！")
        return
    
    delimiter = "\0" if os.environ.get("MISSING_FILES_DELIMITER") == "nul" else "\n"
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        for file_path in missing_files:
            f.write(f"{file_path}{delimiter}")
    
    logger.info(f"\n💾 已保存缺失文件列表到: {OUTPUT_FILE}")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="检测缺失的文档翻译")
    parser.add_argument(
        "--check",
        action="store_true",
        help="发现缺失翻译时返回非零退出码",
    )
    args = parser.parse_args()

    try:
        # 查找缺失的翻译
        missing_files = find_missing_translations()
        
        # 保存到文件
        save_missing_files(missing_files)
        
        # 返回退出码
        if missing_files:
            message = f"发现 {len(missing_files)} 个文件需要翻译"
            if args.check:
                logger.error(f"\n❌ {message}")
                sys.exit(1)
            logger.info(f"\n⚠️  {message}")
            sys.exit(0)  # 正常退出，让 workflow 继续执行翻译
        else:
            logger.info("\n✅ 没有缺失的翻译文件")
            sys.exit(0)
    
    except Exception as e:
        logger.error(f"❌ 发生错误: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()

