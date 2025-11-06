import os
import logging

# 环境变量配置
DOCS_DIR = os.environ.get('DOCS_DIR', '/app/docs')

logger = logging.getLogger('docs-utils')

def format_file_size(bytes):
    """格式化文件大小"""
    if bytes < 1024:
        return f"{bytes} B"
    elif bytes < 1024 * 1024:
        return f"{bytes/1024:.2f} KB"
    elif bytes < 1024 * 1024 * 1024:
        return f"{bytes/(1024*1024):.2f} MB"
    else:
        return f"{bytes/(1024*1024*1024):.2f} GB"

def update_markdown_file(file_path, content):
    """更新Markdown文件内容"""
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # 写入文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        logger.info(f"已更新文件 {file_path}")
        return True
    except Exception as e:
        logger.error(f"更新Markdown文件失败: {str(e)}")
        return False