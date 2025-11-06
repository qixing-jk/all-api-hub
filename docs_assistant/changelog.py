import os
import re
import logging
from datetime import datetime, timezone, timedelta
from github_api import fetch_github_data, GITHUB_REPO, GITHUB_PROXY, USE_PROXY
from utils import update_markdown_file, format_file_size, DOCS_DIR

logger = logging.getLogger('changelog')

def _format_time_to_china_time(published_at, is_english=False):
    """格式化时间为中国时间"""
    if not published_at:
        return 'Unknown time' if is_english else '未知时间'
    
    try:
        # 转换ISO格式的时间为更友好的格式
        pub_date = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
        # 转换为中国时间 (UTC+8)
        china_date = pub_date.replace(tzinfo=timezone.utc).astimezone(timezone(timedelta(hours=8)))
        time_suffix = "(UTC+8)" if is_english else "(中国时间)"
        return f"{china_date.strftime('%Y-%m-%d %H:%M:%S')} {time_suffix}"
    except Exception:
        return published_at

def _process_markdown_headers(body):
    """处理Markdown格式标题级别"""
    # 从最高级别开始处理，避免多次替换
    # 先处理高级别标题再处理低级别标题，避免标题被多次降级
    body = re.sub(r'^######\s+', '###### ', body, flags=re.MULTILINE)  # 六级标题保持不变
    body = re.sub(r'^#####\s+', '###### ', body, flags=re.MULTILINE)   # 五级标题降为六级
    body = re.sub(r'^####\s+', '##### ', body, flags=re.MULTILINE)     # 四级标题降为五级
    body = re.sub(r'^###\s+', '#### ', body, flags=re.MULTILINE)       # 三级标题降为四级
    body = re.sub(r'^##\s+', '### ', body, flags=re.MULTILINE)         # 二级标题降为三级
    body = re.sub(r'^#\s+', '### ', body, flags=re.MULTILINE)          # 一级标题降为三级
    return body

def _process_image_links(body):
    """处理图片链接代理"""
    if not USE_PROXY:
        return body
    
    # 替换Markdown格式的图片链接
    body = re.sub(r'!\[(.*?)\]\((https?://[^)]+)\)', 
                  f'![\g<1>]({GITHUB_PROXY}?url=\\2)', 
                  body)
    
    # 替换HTML格式的图片链接
    body = re.sub(r'<img([^>]*)src="(https?://[^"]+)"([^>]*)>', 
                  f'<img\\1src="{GITHUB_PROXY}?url=\\2"\\3>', 
                  body)
    
    return body

def _format_download_links(tag_name, assets, is_english=False):
    """格式化下载链接"""
    if not assets and not tag_name:
        return ""
    
    download_text = "Download Resources" if is_english else "下载资源"
    markdown = f'    **{download_text}**\n\n'
    
    # 添加正常资源
    for asset in assets:
        name = asset.get('name', '')
        url = asset.get('browser_download_url', '')
        # 替换下载URL为代理URL
        if USE_PROXY and 'github.com' in url:
            url = f'{GITHUB_PROXY}?url={url}'
        size = format_file_size(asset.get('size', 0))
        markdown += f'    - [{name}]({url}) ({size})\n'
    
    # 添加源代码下载链接
    if tag_name:
        # 构建zip下载链接
        zip_url = f'https://github.com/{GITHUB_REPO}/archive/refs/tags/{tag_name}.zip'
        if USE_PROXY:
            proxy_zip_url = f'{GITHUB_PROXY}?url={zip_url}'
            markdown += f'    - [Source code (zip)]({proxy_zip_url})\n'
        else:
            markdown += f'    - [Source code (zip)]({zip_url})\n'
        
        # 构建tar.gz下载链接
        tar_url = f'https://github.com/{GITHUB_REPO}/archive/refs/tags/{tag_name}.tar.gz'
        if USE_PROXY:
            proxy_tar_url = f'{GITHUB_PROXY}?url={tar_url}'
            markdown += f'    - [Source code (tar.gz)]({proxy_tar_url})\n'
        else:
            markdown += f'    - [Source code (tar.gz)]({tar_url})\n'
    
    markdown += '\n'
    return markdown

def _get_version_info(index, prerelease, is_english=False):
    """获取版本信息"""
    if is_english:
        version_type = "Pre-release" if prerelease else "Release"
        if index == 0:
            version_type = f"Latest {version_type}"
    else:
        version_type = "预发布版本" if prerelease else "正式版本"
        if index == 0:
            version_type = f"最新{version_type}"
    
    admonition_type = "success" if index == 0 else "info"
    return version_type, admonition_type

def format_releases_markdown(releases_data, is_english=False):
    """将发布数据格式化为Markdown内容"""
    if not releases_data or len(releases_data) == 0:
        return "No version data available, please try again later." if is_english else "暂无版本数据，请稍后再试。"
    
    # 语言配置
    config = {
        'title': "# 📝 Changelog" if is_english else "# 📝 更新日志",
        'warning_title': "Version Log Information · Data updated at" if is_english else "版本日志信息 · 数据更新于",
        'warning_desc': "To view all historical versions, please visit the [GitHub Releases page](https://github.com/{GITHUB_REPO}/releases). This page automatically fetches the latest update information from that page." if is_english else "如需查看全部历史版本，请访问 [GitHub Releases 页面](https://github.com/{GITHUB_REPO}/releases)，本页面从该页面定时获取最新更新信息。",
        'unknown_version': 'Unknown Version' if is_english else '未知版本',
        'no_release_notes': 'No release notes' if is_english else '无发布说明',
        'published_at': 'Published at' if is_english else '发布于'
    }
    
    markdown = f"{config['title']}\n\n"
    
    # 获取当前时间
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    time_suffix = "(UTC+8)" if is_english else "(中国时间)"
    
    markdown += f"!!! warning \"{config['warning_title']} {current_time} {time_suffix}\"\n"
    markdown += f"    {config['warning_desc']}\n\n"
    
    for index, release in enumerate(releases_data):
        tag_name = release.get('tag_name', config['unknown_version'])
        name = release.get('name') or tag_name
        published_at = release.get('published_at', '')
        body = release.get('body', config['no_release_notes'])
        prerelease = release.get('prerelease', False)
        
        # 格式化时间
        formatted_date = _format_time_to_china_time(published_at, is_english)
        
        # 处理Markdown格式标题级别
        body = _process_markdown_headers(body)
        
        # 处理图片链接
        body = _process_image_links(body)
        
        markdown += f'## {name}\n\n'
        
        # 获取版本信息
        version_type, admonition_type = _get_version_info(index, prerelease, is_english)
        
        markdown += f'???+ {admonition_type} "{version_type} · {config["published_at"]} {formatted_date}"\n\n'
        
        # 缩进内容以适应admonition格式
        indented_body = '\n'.join(['    ' + line for line in body.split('\n')])
        markdown += f'{indented_body}\n\n'
        
        # 添加资源下载部分
        assets = release.get('assets', [])
        download_links = _format_download_links(tag_name, assets, is_english)
        if download_links:
            markdown += download_links
        
        markdown += '---\n\n'
    
    return markdown

def format_releases_markdown_en(releases_data):
    """将发布数据格式化为Markdown内容（英文版）"""
    return format_releases_markdown(releases_data, is_english=True)

def update_changelog_file(is_english=False):
    """更新更新日志文件"""
    try:
        # 获取发布数据
        releases_data, success = fetch_github_data(GITHUB_REPO, "releases", 30)
        if not success or not releases_data:
            error_msg = "Failed to fetch release data" if is_english else "无法获取发布数据"
            logger.error(error_msg)
            return False
        
        # 格式化为Markdown
        releases_markdown = format_releases_markdown(releases_data, is_english)
        
        # 更新到文件
        file_path = 'docs/en/wiki/changelog.md' if is_english else 'docs/wiki/changelog.md'
        changelog_file = os.path.join(DOCS_DIR, file_path)
        return update_markdown_file(changelog_file, releases_markdown)
    
    except Exception as e:
        error_msg = f"Failed to update changelog: {str(e)}" if is_english else f"更新更新日志失败: {str(e)}"
        logger.error(error_msg)
        return False

def update_changelog_file_en():
    """更新更新日志文件（英文版）"""
    return update_changelog_file(is_english=True)