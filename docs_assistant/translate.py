#!/usr/bin/env python3
"""
文档自动翻译脚本
使用 OpenAI API 将中文文档翻译为英文和日文
"""

import os
import sys
import logging
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 配置
DOCS_DIR = Path(__file__).parent.parent / 'docs/docs'
LANGUAGES = {
    'en': {
        'name': 'English',
        'native_name': '英文',
        'dir': 'en'
    },
    'ja': {
        'name': 'Japanese',
        'native_name': '日文',
        'dir': 'ja'
    }
}

# OpenAI 配置
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
OPENAI_BASE_URL = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')

# 重试配置
MAX_RETRIES = int(os.environ.get('MAX_RETRIES', '3'))  # 最大重试次数
RETRY_DELAY = int(os.environ.get('RETRY_DELAY', '2'))  # 初始重试延迟（秒）
RETRY_BACKOFF = float(os.environ.get('RETRY_BACKOFF', '2.0'))  # 退避倍数

# 并发配置
MAX_WORKERS = int(os.environ.get('MAX_WORKERS', '3'))  # 最大并发数

# 强制翻译配置
FORCE_TRANSLATE = os.environ.get('FORCE_TRANSLATE', 'false').lower() == 'true'  # 是否强制重新翻译已存在的文件

if not OPENAI_API_KEY:
    logger.error("错误: 未设置 OPENAI_API_KEY 环境变量")
    sys.exit(1)

# 初始化 OpenAI 客户端
client = OpenAI(
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL
)


def get_translation_prompt(target_language: str, content: str) -> str:
    """构建翻译提示词"""
    language_name = LANGUAGES[target_language]['name']
    
    prompt = f"""你是一个专业的技术文档翻译专家。请将以下 Markdown 格式的技术文档从中文翻译为{LANGUAGES[target_language]['native_name']}。

翻译要求：
1. 保持 Markdown 格式完整，包括标题、列表、代码块、链接等
2. 代码块内容不要翻译
3. 专业术语使用行业标准翻译
4. 保持技术准确性和专业性
5. 图片路径、链接路径保持不变（如果路径中包含中文目录，保持原样）
6. Front matter (YAML 头部) 中的内容需要翻译
7. 保持原文的语气和风格
8. 对于特殊的专有名词（如产品名 "New API"、"Cherry Studio" 等），保持不变

术语表（不要放在翻译内容中）：

| 中文 | English | 说明 | Description |
|------|---------|------|-------------|
| 倍率 | Ratio | 用于计算价格的乘数因子 | Multiplier factor used for price calculation |
| 令牌 | Token | API访问凭证，也指模型处理的文本单元 | API access credentials or text units processed by models |
| 渠道 | Channel | API服务提供商的接入通道 | Access channel for API service providers |
| 分组 | Group | 用户或令牌的分类，影响价格倍率 | Classification of users or tokens, affecting price ratios |
| 额度 | Quota | 用户可用的服务额度 | Available service quota for users |

请直接返回翻译后的内容，不要添加任何解释或说明。

原文：

{content}
"""
    
    return prompt


def translate_content(content: str, target_language: str) -> str:
    """使用 OpenAI API 翻译内容（带重试机制）"""
    retry_count = 0
    last_error = None
    
    while retry_count <= MAX_RETRIES:
        try:
            if retry_count > 0:
                logger.info(f"第 {retry_count} 次重试翻译为 {LANGUAGES[target_language]['native_name']}...")
            else:
                logger.info(f"正在翻译为 {LANGUAGES[target_language]['native_name']}...")
            
            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": f"You are a professional technical documentation translator. Translate accurately while preserving Markdown formatting, code blocks, and technical terms."
                    },
                    {
                        "role": "user",
                        "content": get_translation_prompt(target_language, content)
                    }
                ],
                temperature=0.3,  # 较低的温度以获得更一致的翻译
                timeout=300.0,  # 300秒超时
            )
            
            translated_content = response.choices[0].message.content.strip()
            logger.info(f"翻译完成 ({LANGUAGES[target_language]['native_name']})")
            
            return translated_content
        
        except Exception as e:
            last_error = e
            retry_count += 1
            
            if retry_count <= MAX_RETRIES:
                # 计算退避延迟时间（指数退避）
                delay = RETRY_DELAY * (RETRY_BACKOFF ** (retry_count - 1))
                logger.warning(
                    f"翻译失败: {str(e)}, "
                    f"将在 {delay:.1f} 秒后进行第 {retry_count} 次重试 "
                    f"(最多 {MAX_RETRIES} 次)"
                )
                time.sleep(delay)
            else:
                logger.error(
                    f"翻译失败，已达到最大重试次数 ({MAX_RETRIES}): {str(e)}"
                )
                raise last_error


def translate_file(source_file: Path, file_index: int = 0, total_files: int = 0, manual_translations: set = None):
    """翻译单个文件"""
    prefix = f"[{file_index}/{total_files}] " if total_files > 0 else ""
    logger.info(f"{prefix}处理文件: {source_file}")
    
    # 读取源文件
    try:
        with open(source_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        logger.error(f"{prefix}读取文件失败 {source_file}: {str(e)}")
        return False
    
    # 计算相对路径
    try:
        rel_path = source_file.relative_to(DOCS_DIR)
    except ValueError:
        logger.error(f"{prefix}文件不在 docs 目录中: {source_file}")
        return False
    
    # 检查是否有手动翻译
    if manual_translations is None:
        manual_translations = set()
    
    # 检查当前文件是否有对应的手动翻译
    has_manual_translation = False
    for lang_code, lang_info in LANGUAGES.items():
        target_file = DOCS_DIR / lang_info['dir'] / rel_path
        if str(target_file) in manual_translations:
            has_manual_translation = True
            logger.info(f"{prefix}📝 检测到手动翻译: {target_file}")
            break
    
    translated_count = 0
    skipped_count = 0
    
    # 翻译到各个目标语言
    for lang_code, lang_info in LANGUAGES.items():
        try:
            # 构建目标文件路径
            target_file = DOCS_DIR / lang_info['dir'] / rel_path
            
            # 检查是否有手动翻译
            if str(target_file) in manual_translations:
                logger.info(f"{prefix}⏭️  跳过 {lang_info['native_name']}翻译（检测到手动翻译）")
                skipped_count += 1
                continue
            
            # 检查翻译是否已存在
            if target_file.exists() and not FORCE_TRANSLATE:
                logger.info(f"{prefix}⏭️  跳过 {lang_info['native_name']}翻译（已存在）")
                skipped_count += 1
                continue
            elif target_file.exists() and FORCE_TRANSLATE:
                logger.info(f"{prefix}🔄 强制重新翻译 {lang_info['native_name']}（文件已存在）")
            
            # 翻译内容
            translated_content = translate_content(content, lang_code)
            
            # 确保目标目录存在
            target_file.parent.mkdir(parents=True, exist_ok=True)
            
            # 写入翻译后的文件
            with open(target_file, 'w', encoding='utf-8') as f:
                f.write(translated_content)
            
            logger.info(f"{prefix}✓ 已保存 {lang_info['native_name']}翻译")
            translated_count += 1
        
        except Exception as e:
            logger.error(f"{prefix}处理 {lang_info['native_name']}翻译失败: {str(e)}")
            continue
    
    if translated_count > 0:
        logger.info(f"{prefix}✅ 完成翻译 {translated_count} 个语言")
    
    return translated_count > 0 or skipped_count > 0


def detect_manual_translations():
    """检测手动翻译的文件"""
    manual_translations = set()
    
    try:
        # 获取当前提交中修改的文件列表
        import subprocess
        result = subprocess.run(
            ['git', 'diff', '--name-only', 'HEAD~1', 'HEAD'],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent
        )
        
        if result.returncode == 0:
            changed_files = result.stdout.strip().split('\n')
            for file_path in changed_files:
                if file_path and ('/en/' in file_path or '/ja/' in file_path):
                    manual_translations.add(file_path)
                    logger.info(f"检测到手动翻译文件: {file_path}")
        
    except Exception as e:
        logger.warning(f"检测手动翻译时出错: {str(e)}")
    
    return manual_translations


def main():
    """主函数"""
    if len(sys.argv) < 2:
        logger.error("用法: python translate.py <file1.md> [file2.md] ...")
        sys.exit(1)
    
    files_to_translate = []
    
    for file_arg in sys.argv[1:]:
        file_path = Path(file_arg).resolve()  # 转换为绝对路径
        
        # 跳过英文和日文目录
        if '/en/' in str(file_path) or '/ja/' in str(file_path):
            logger.info(f"跳过已翻译文件: {file_path}")
            continue
        
        if not file_path.exists():
            logger.warning(f"文件不存在，跳过: {file_path}")
            continue
        
        if file_path.suffix != '.md':
            logger.warning(f"不是 Markdown 文件，跳过: {file_path}")
            continue
        
        files_to_translate.append(file_path)
    
    if not files_to_translate:
        logger.info("没有需要翻译的文件")
        return
    
    # 检测手动翻译
    manual_translations = detect_manual_translations()
    
    logger.info(f"共有 {len(files_to_translate)} 个文件需要翻译")
    logger.info(f"使用模型: {OPENAI_MODEL}")
    logger.info(f"API 地址: {OPENAI_BASE_URL}")
    logger.info(f"目标语言: {', '.join([lang['native_name'] for lang in LANGUAGES.values()])}")
    logger.info(f"重试配置: 最大 {MAX_RETRIES} 次, 初始延迟 {RETRY_DELAY}s, 退避倍数 {RETRY_BACKOFF}x")
    logger.info(f"并发配置: 最大 {MAX_WORKERS} 个并发任务")
    logger.info(f"强制翻译: {'是' if FORCE_TRANSLATE else '否'}")
    logger.info(f"检测到 {len(manual_translations)} 个手动翻译文件")
    logger.info("-" * 60)
    
    # 使用线程池并发翻译
    total_files = len(files_to_translate)
    success_count = 0
    fail_count = 0
    
    if MAX_WORKERS == 1:
        # 单线程模式
        logger.info("🔄 使用单线程模式\n")
        for idx, file_path in enumerate(files_to_translate, 1):
            result = translate_file(file_path, idx, total_files, manual_translations)
            if result:
                success_count += 1
            else:
                fail_count += 1
            logger.info("-" * 60)
    else:
        # 并发模式
        logger.info(f"🚀 使用并发模式（{MAX_WORKERS} 个工作线程）\n")
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # 提交所有任务
            future_to_file = {
                executor.submit(translate_file, file_path, idx, total_files, manual_translations): file_path
                for idx, file_path in enumerate(files_to_translate, 1)
            }
            
            # 等待任务完成
            for future in as_completed(future_to_file):
                file_path = future_to_file[future]
                try:
                    result = future.result()
                    if result:
                        success_count += 1
                    else:
                        fail_count += 1
                except Exception as e:
                    logger.error(f"❌ 文件翻译异常 {file_path}: {str(e)}")
                    fail_count += 1
                
                logger.info("-" * 60)
    
    # 输出统计信息
    logger.info(f"\n📊 翻译统计:")
    logger.info(f"   总文件数: {total_files}")
    logger.info(f"   成功: {success_count}")
    if fail_count > 0:
        logger.info(f"   失败: {fail_count}")
    logger.info("\n✅ 所有翻译任务完成！")


if __name__ == '__main__':
    main()

