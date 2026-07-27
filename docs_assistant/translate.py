#!/usr/bin/env python3
"""
文档自动翻译脚本
使用 OpenAI API 将中文文档翻译为英文和日文
"""

import os
import sys
import logging
import time
import re
import subprocess
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
REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).parent.parent / 'docs/docs'
DOCS_REPO_PREFIX = DOCS_DIR.relative_to(REPO_ROOT).as_posix()
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
TRANSLATE_DIFF_BASE = os.environ.get('TRANSLATE_DIFF_BASE', 'HEAD~1')
TRANSLATE_DIFF_HEAD = os.environ.get('TRANSLATE_DIFF_HEAD', 'HEAD')

if not OPENAI_API_KEY:
    logger.error("错误: 未设置 OPENAI_API_KEY 环境变量")
    sys.exit(1)

# 初始化 OpenAI 客户端
client = OpenAI(
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL
)

MARKDOWN_IMAGE_PATTERN = re.compile(r'!\[([^\]]*)\]\(([^)\n]+)\)')
MARKDOWN_LINK_PATTERN = re.compile(r'(?<!!)\[([^\]]*)\]\(([^)\n]+)\)')
HTML_IMAGE_SRC_PATTERN = re.compile(
    r'(<img\b[^>]*\bsrc=)(["\'])([^"\']+)(\2)',
    re.IGNORECASE,
)
HTML_LINK_HREF_PATTERN = re.compile(
    r'(<a\b[^>]*\bhref=)(["\'])([^"\']+)(\2)',
    re.IGNORECASE,
)
HTML_ANCHOR_ID_PATTERN = re.compile(
    r'(<a\b[^>]*\bid=)(["\'])([^"\']+)(\2)',
    re.IGNORECASE,
)
URL_SUFFIX_PATTERN = re.compile(r'^([^?#]+)([?#].*)?$')
OUTER_CODE_FENCE_PATTERN = re.compile(
    r'^\s*```(?:markdown|md|yaml|yml)?\s*\r?\n([\s\S]*?)\r?\n```\s*$',
    re.IGNORECASE,
)


def is_translation_relative_path(path_str: str) -> bool:
    """Return True when the docs-relative path is inside a translated language directory."""
    return any(path_str == lang or path_str.startswith(f'{lang}/') for lang in LANGUAGES)


def is_translated_doc_repo_path(repo_path: str) -> bool:
    """Return True when the repository-relative path points at a translated Markdown doc."""
    if not repo_path.endswith('.md'):
        return False

    prefix = f'{DOCS_REPO_PREFIX}/'
    if not repo_path.startswith(prefix):
        return False

    return is_translation_relative_path(repo_path[len(prefix):])


def get_translation_prompt(target_language: str, content: str) -> str:
    """构建翻译提示词"""
    prompt = f"""你是一个专业的技术文档翻译专家。请将以下 Markdown 格式的技术文档从中文翻译为{LANGUAGES[target_language]['native_name']}。

翻译要求：
1. 保持 Markdown 格式完整，包括标题、列表、代码块、链接等
2. 代码块内容不要翻译
3. 专业术语使用行业标准翻译
4. 保持技术准确性和专业性
5. 图片路径、链接路径保持不变（如果路径中包含中文目录，保持原样）
6. 如果原文包含 Front matter (YAML 头部)，则其中内容需要翻译；如果原文没有 Front matter，不要新增任何 YAML 头部，也不要自行补充 `title`、`tagline`、`heroText`、`features` 等字段
7. 保持原文的语气和风格
8. 对于特殊的专有名词（如产品名 "New API"、"Cherry Studio" 等），保持不变
9. 如果原文包含 YAML front matter，则键名、层级结构与列表缩进必须保持不变
10. 如果原文包含 YAML front matter，则其中所有字符串值必须保留或改写为双引号包裹的形式，尤其是 title、tagline、heroText、footer、actions[*].text、actions[*].link、actions[*].type、features[*].title、features[*].details
11. 如果原文包含 YAML front matter，不要输出未加引号且包含 ":"、"#"、"["、"]"、"{"、"}" 的 YAML 字符串值
12. Markdown 图片 `![alt](...)` 和 HTML `<img src="...">` 中的本地相对路径必须逐字符原样保留，不要翻译、不要改写、不要自行补 `../` 或删减层级
13. 远程图片 URL、站外链接、站内绝对路径（以 `/` 开头）也必须原样保留
14. Markdown 链接目标 `(...)`、HTML `<a href="...">`、显式锚点 `<a id="..."></a>` 中的 URL、路径、`#fragment` 和 `id` 必须逐字符原样保留；只翻译链接文字，不要翻译或根据标题改写锚点
15. 不要在整篇输出外层包裹 ```markdown、```md、```yaml、```yml 或 ``` 代码块；输出必须直接从 YAML front matter 的 `---` 或正文第一行开始
16. 标题、表格单元、链接文字、图片 alt、admonition 标题等所有自然语言都属于待翻译内容；除代码、URL、路径、明确要求保留的产品/版本标签外，不要残留中文原文
17. 译文必须符合目标语言技术文档的自然表达，避免逐词直译和明显的中文句式；必要时可以调整语序以保证流畅
18. 遇到像“正式版 Stable”“Nightly 预发布”这类中外文混合标签时，可以保留 Stable、Nightly 等产品或渠道标签，但周围说明、链接文本、句子和表格内容必须完整翻译为目标语言，并在同一文档内保持一致
19. 输出前请自检：除代码、URL、路径、明确保留的专有名词或英文产品标签外，不应残留中文句子、中文链接文字或中文表格单元

术语表（不要放在翻译内容中）：

| 中文 | English | 日本語 | 说明 |
|------|---------|--------|------|
| API 凭据库 | API Credential Library | API 認証情報庫 | 保存独立 Base URL + API Key 的功能名称 |
| 倍率 | Ratio | 倍率 | 用于计算价格的乘数因子 |
| 令牌 | Token | トークン | API访问凭证，也指模型处理的文本单元 |
| 渠道 | Channel | チャネル | API服务提供商的接入通道 |
| 分组 | Group | グループ | 用户或令牌的分类，影响价格倍率 |
| 额度 | Quota | クォータ | 用户可用的服务额度 |

请直接返回翻译后的内容，不要添加任何解释或说明。

原文：

{content}
"""
    
    return prompt


def get_incremental_translation_prompt(
    target_language: str,
    new_source_content: str,
    existing_translation_content: str,
    source_diff: str,
) -> str:
    """构建基于旧译文和 diff 的最小修改翻译提示词"""
    prompt = f"""你正在基于已有译文做增量更新，而不是重新翻译整份文档。请根据中文源文的变更 diff，在已有{LANGUAGES[target_language]['native_name']}译文上做最小必要修改，并返回完整的更新后文档。

核心目标：
1. 优先保证“最小修改”，不是追求整篇文风统一
2. 只更新受本次 diff 影响的翻译内容
3. 未受本次 diff 影响的已有译文应尽量逐字保持不变，不要顺手重写历史段落

翻译要求：
1. 返回完整的更新后{LANGUAGES[target_language]['native_name']}文档，不要只返回 diff，也不要添加解释
2. 保持 Markdown 格式完整，包括标题、列表、代码块、链接、admonition 等
3. 代码块内容不要翻译
4. 专业术语使用行业标准翻译；产品名如 "New API"、"Cherry Studio" 保持不变
5. 如果中文原文没有 Front matter (YAML 头部)，不要新增任何 YAML 头部，也不要自行补充 `title`、`tagline`、`heroText`、`features` 等字段
6. 如果中文原文包含 YAML front matter，则键名、层级结构、列表缩进和字符串引号规则必须保持正确
7. Markdown 图片 `![alt](...)`、HTML `<img src="...">`、本地路径、远程 URL、站内绝对路径都必须保持可用，不要擅自改写
8. Markdown 链接目标 `(...)`、HTML `<a href="...">`、显式锚点 `<a id="..."></a>` 中的 URL、路径、`#fragment` 和 `id` 必须逐字符原样保留；只翻译链接文字，不要翻译或根据标题改写锚点
9. 不要在整篇输出外层包裹 ```markdown、```md、```yaml、```yml 或 ``` 代码块
10. 对于本次新增或修改的自然语言内容，必须翻译成目标语言；不要把新增正文直接保留为中文
11. 标题、表格单元、链接文字、图片 alt、admonition 标题等新增或修改的自然语言都必须翻译；不要把新增链接文字或表格内容直接保留为中文
12. 译文必须符合目标语言技术文档的自然表达，避免逐词直译和明显的中文句式；必要时可以调整语序以保证流畅
13. 如果本次改动包含“正式版 Stable”“Nightly 预发布”这类中外文混合标签，可以保留 Stable、Nightly 等产品或渠道标签，但周围说明、链接文字和句子必须完整翻译并保持一致
14. 输出前请自检：除代码、URL、路径、明确保留的专有名词或英文产品标签外，不应残留中文句子、中文链接文字或中文表格单元
15. 如果旧译文中存在与本次 diff 无关的瑕疵，也不要顺手大范围改写；除非 diff 直接涉及该处

术语表（不要放在翻译内容中）：

| 中文 | English | 日本語 | 说明 |
|------|---------|--------|------|
| API 凭据库 | API Credential Library | API 認証情報庫 | 保存独立 Base URL + API Key 的功能名称 |
| 倍率 | Ratio | 倍率 | 用于计算价格的乘数因子 |
| 令牌 | Token | トークン | API访问凭证，也指模型处理的文本单元 |
| 渠道 | Channel | チャネル | API服务提供商的接入通道 |
| 分组 | Group | グループ | 用户或令牌的分类，影响价格倍率 |
| 额度 | Quota | クォータ | 用户可用的服务额度 |

输入一：最新中文源文
<latest_source_markdown>
{new_source_content}
</latest_source_markdown>

输入二：上一版{LANGUAGES[target_language]['native_name']}译文
<previous_translation_markdown>
{existing_translation_content}
</previous_translation_markdown>

输入三：中文源文 diff（仅用于定位改动范围，请不要把 diff 标记带进输出）
<source_diff>
{source_diff}
</source_diff>
"""

    return prompt


def strip_outer_code_fence(content: str) -> str:
    """Remove an accidental outer fenced-code wrapper from the whole document."""
    match = OUTER_CODE_FENCE_PATTERN.match(content)
    if not match:
        return content

    return match.group(1).strip()


def _replace_ordered_matches(
    translated_content: str,
    source_matches: list[str],
    translated_pattern: re.Pattern,
    replacement_factory,
    label: str,
) -> str:
    """Restore ordered, non-translatable Markdown/HTML attributes after LLM output."""
    translated_matches = list(translated_pattern.finditer(translated_content))

    if len(source_matches) != len(translated_matches):
        logger.warning(
            "跳过%s恢复：源文数量 %s 与译文数量 %s 不一致",
            label,
            len(source_matches),
            len(translated_matches),
        )
        return translated_content

    source_index = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal source_index
        source_value = source_matches[source_index]
        source_index += 1
        return replacement_factory(match, source_value)

    return translated_pattern.sub(replace, translated_content)


def preserve_translated_link_targets(source_content: str, translated_content: str) -> str:
    """Keep link targets and explicit anchor ids stable across translated docs."""
    markdown_link_targets = [
        match.group(2) for match in MARKDOWN_LINK_PATTERN.finditer(source_content)
    ]
    translated_content = _replace_ordered_matches(
        translated_content,
        markdown_link_targets,
        MARKDOWN_LINK_PATTERN,
        lambda match, source_target: f"[{match.group(1)}]({source_target})",
        "Markdown 链接目标",
    )

    html_link_hrefs = [
        match.group(3) for match in HTML_LINK_HREF_PATTERN.finditer(source_content)
    ]
    translated_content = _replace_ordered_matches(
        translated_content,
        html_link_hrefs,
        HTML_LINK_HREF_PATTERN,
        lambda match, source_href: (
            f"{match.group(1)}{match.group(2)}{source_href}{match.group(4)}"
        ),
        "HTML 链接 href",
    )

    html_anchor_ids = [
        match.group(3) for match in HTML_ANCHOR_ID_PATTERN.finditer(source_content)
    ]
    translated_content = _replace_ordered_matches(
        translated_content,
        html_anchor_ids,
        HTML_ANCHOR_ID_PATTERN,
        lambda match, source_id: (
            f"{match.group(1)}{match.group(2)}{source_id}{match.group(4)}"
        ),
        "HTML 锚点 id",
    )

    return translated_content


def is_local_relative_url(url: str) -> bool:
    """Return True when the URL is a local relative path we should relocate."""
    lowered = url.lower()

    if (
        lowered.startswith('http://')
        or lowered.startswith('https://')
        or lowered.startswith('/')
        or lowered.startswith('#')
        or lowered.startswith('data:')
        or lowered.startswith('mailto:')
        or lowered.startswith('tel:')
        or lowered.startswith('javascript:')
    ):
        return False

    return True


def split_url_suffix(url: str):
    """Split a URL into its path and query/hash suffix."""
    match = URL_SUFFIX_PATTERN.match(url)
    if not match:
        return url, ''

    return match.group(1), match.group(2) or ''


def resolve_localized_image_target(asset_path: Path, target_language: str) -> Path:
    """Prefer localized image variants when they exist for translated docs."""
    if target_language not in LANGUAGES:
        return asset_path

    static_image_root = DOCS_DIR / 'static' / 'image'

    try:
        relative = asset_path.relative_to(static_image_root)
    except ValueError:
        return asset_path

    if not relative.parts or relative.parts[0] == 'en':
        return asset_path

    localized_candidate = static_image_root / 'en' / relative
    if localized_candidate.exists():
        return localized_candidate

    return asset_path


def rewrite_local_image_url(
    original_url: str,
    source_file: Path,
    target_file: Path,
    target_language: str,
) -> str:
    """Rewrite a local image URL so it stays valid from the translated file."""
    path_part, suffix = split_url_suffix(original_url)

    if not is_local_relative_url(path_part):
        return original_url

    source_asset = (source_file.parent / path_part).resolve(strict=False)
    target_asset = resolve_localized_image_target(source_asset, target_language)
    relocated = os.path.relpath(target_asset, start=target_file.parent)
    relocated = relocated.replace('\\', '/')

    return f'{relocated}{suffix}'


def collect_image_url_mapping(
    source_content: str,
    source_file: Path,
    target_file: Path,
    target_language: str,
):
    """Build a mapping from source image URLs to translated-file-relative URLs."""
    image_urls = set()

    for match in MARKDOWN_IMAGE_PATTERN.finditer(source_content):
        image_urls.add(match.group(2))

    for match in HTML_IMAGE_SRC_PATTERN.finditer(source_content):
        image_urls.add(match.group(3))

    mapping = {}
    for url in image_urls:
        rewritten = rewrite_local_image_url(
            url,
            source_file=source_file,
            target_file=target_file,
            target_language=target_language,
        )
        if rewritten != url:
            mapping[url] = rewritten

    return mapping


def rewrite_translated_image_paths(translated_content: str, image_url_mapping: dict) -> str:
    """Rewrite image paths in translated markdown using the deterministic mapping."""
    if not image_url_mapping:
        return translated_content

    def replace_markdown(match: re.Match[str]) -> str:
        alt_text = match.group(1)
        image_url = match.group(2)
        rewritten = image_url_mapping.get(image_url, image_url)
        return f'![{alt_text}]({rewritten})'

    def replace_html(match: re.Match[str]) -> str:
        prefix = match.group(1)
        quote = match.group(2)
        image_url = match.group(3)
        rewritten = image_url_mapping.get(image_url, image_url)
        return f'{prefix}{quote}{rewritten}{quote}'

    translated_content = MARKDOWN_IMAGE_PATTERN.sub(replace_markdown, translated_content)
    translated_content = HTML_IMAGE_SRC_PATTERN.sub(replace_html, translated_content)

    return translated_content


def get_repo_relative_posix_path(file_path: Path) -> str:
    """Return a repository-relative POSIX path for git commands."""
    return file_path.resolve().relative_to(REPO_ROOT).as_posix()


def get_source_diff(source_file: Path) -> str:
    """Read the source-file unified diff between the configured revisions."""
    repo_relative_path = get_repo_relative_posix_path(source_file)

    result = subprocess.run(
        [
            'git',
            'diff',
            '--no-color',
            '--unified=3',
            TRANSLATE_DIFF_BASE,
            TRANSLATE_DIFF_HEAD,
            '--',
            repo_relative_path,
        ],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    if result.returncode != 0:
        logger.warning(
            f"读取源文 diff 失败 {repo_relative_path}: {result.stderr.strip() or result.returncode}"
        )
        return ''

    return result.stdout.strip()


def translate_content(
    content: str,
    target_language: str,
    existing_translation_content: str = '',
    source_diff: str = '',
) -> str:
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
                        "content": (
                            "You are a professional technical documentation translator and editor. "
                            "Translate accurately while preserving Markdown formatting, code blocks, "
                            "and technical terms. Produce natural, idiomatic target-language prose, "
                            "and never leave newly added Chinese text untranslated in headings, "
                            "tables, link text, or admonitions unless it is a proper noun, code, "
                            "URL, path, or an explicitly preserved product label."
                        )
                    },
                    {
                        "role": "user",
                        "content": (
                            get_incremental_translation_prompt(
                                target_language,
                                content,
                                existing_translation_content,
                                source_diff,
                            )
                            if existing_translation_content and source_diff
                            else get_translation_prompt(target_language, content)
                        )
                    }
                ],
                temperature=0.3,  # 较低的温度以获得更一致的翻译
                timeout=300.0,  # 300秒超时
            )
            
            translated_content = response.choices[0].message.content.strip()
            translated_content = strip_outer_code_fence(translated_content)
            translated_content = preserve_translated_link_targets(
                content,
                translated_content,
            )
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
    
    translated_count = 0
    skipped_count = 0
    source_diff = get_source_diff(source_file)
    
    # 翻译到各个目标语言
    for lang_code, lang_info in LANGUAGES.items():
        try:
            # 构建目标文件路径
            target_file = DOCS_DIR / lang_info['dir'] / rel_path
            existing_translation_content = ''
            if target_file.exists():
                existing_translation_content = target_file.read_text(encoding='utf-8')

            image_url_mapping = collect_image_url_mapping(
                content,
                source_file=source_file,
                target_file=target_file,
                target_language=lang_code,
            )
            
            # 检查是否有手动翻译
            target_repo_path = get_repo_relative_posix_path(target_file)
            if target_repo_path in manual_translations:
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
            translated_content = translate_content(
                content,
                lang_code,
                existing_translation_content=existing_translation_content,
                source_diff=source_diff,
            )
            translated_content = rewrite_translated_image_paths(
                translated_content,
                image_url_mapping,
            )
            
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
        result = subprocess.run(
            [
                'git',
                'diff',
                '--name-only',
                '--diff-filter=AMR',
                '--find-renames',
                TRANSLATE_DIFF_BASE,
                TRANSLATE_DIFF_HEAD,
                '--',
                DOCS_REPO_PREFIX,
            ],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT
        )
        
        if result.returncode == 0:
            changed_files = result.stdout.strip().split('\n')
            for file_path in changed_files:
                normalized_path = file_path.strip()
                if normalized_path and is_translated_doc_repo_path(normalized_path):
                    manual_translations.add(normalized_path)
                    logger.info(f"检测到手动翻译文件: {normalized_path}")
        
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

        if not file_path.exists():
            logger.warning(f"文件不存在，跳过: {file_path}")
            continue
        
        if file_path.suffix != '.md':
            logger.warning(f"不是 Markdown 文件，跳过: {file_path}")
            continue

        try:
            rel_path = file_path.relative_to(DOCS_DIR).as_posix()
        except ValueError:
            logger.warning(f"文件不在 docs 目录中，跳过: {file_path}")
            continue

        if is_translation_relative_path(rel_path):
            logger.info(f"跳过已翻译文件: {file_path}")
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
