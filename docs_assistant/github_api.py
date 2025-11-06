import os
import time
import requests
import logging

# 环境变量配置
GITHUB_REPO = os.environ.get('GITHUB_REPO', 'Calcium-Ion/new-api')
GITHUB_PROXY = os.environ.get('GITHUB_PROXY', 'https://p.aass.cc/proxy')
USE_PROXY = os.environ.get('USE_PROXY', 'true').lower() == 'true'

# GitHub API限制相关参数
MAX_RETRY_ATTEMPTS = 3
RATE_LIMIT_WAIT_TIME = 60  # 触发限制后等待的秒数

logger = logging.getLogger('github-api')

def fetch_github_data(repo, data_type, count, use_proxy=True):
    """获取GitHub数据，智能处理API限制"""
    logger.info(f"获取GitHub数据: {repo}, {data_type}, count={count}")
    
    headers = {'User-Agent': 'Mozilla/5.0 DocUpdater/1.0'}
    
    for attempt in range(MAX_RETRY_ATTEMPTS):
        try:
            # 构建API路径
            if data_type == "releases":
                api_path = f'repos/{repo}/releases?per_page={count}'
            elif data_type == "contributors":
                api_path = f'repos/{repo}/contributors?per_page={count}'
            else:
                return None, False
            
            # 构建API URL
            if use_proxy and USE_PROXY:
                original_api_url = f'https://api.github.com/{api_path}'
                api_url = f'{GITHUB_PROXY}?url={original_api_url}'
            else:
                api_url = f'https://api.github.com/{api_path}'
            
            # 发送请求
            response = requests.get(api_url, headers=headers, timeout=30)
            
            # 检查API限制
            if response.status_code == 403 and 'rate limit exceeded' in response.text.lower():
                logger.warning(f"GitHub API限制已达到，等待{RATE_LIMIT_WAIT_TIME}秒后重试...")
                time.sleep(RATE_LIMIT_WAIT_TIME)
                continue
                
            response.raise_for_status()
            data = response.json()
            
            # 处理分页 (仅适用于贡献者数据)
            if data_type == "contributors" and len(data) < count and len(data) > 0:
                all_data = data.copy()
                page = 2
                
                # 最多获取3页，避免触发API限制
                while len(all_data) < count and page <= 3:
                    # 等待1秒避免请求过快
                    time.sleep(1)
                    
                    # 构建下一页URL
                    next_api_url = f'{api_path}&page={page}'
                    if use_proxy and USE_PROXY:
                        next_url = f'{GITHUB_PROXY}?url=https://api.github.com/{next_api_url}'
                    else:
                        next_url = f'https://api.github.com/{next_api_url}'
                    
                    next_response = requests.get(next_url, headers=headers, timeout=30)
                    next_response.raise_for_status()
                    next_data = next_response.json()
                    
                    if not next_data:
                        break
                        
                    all_data.extend(next_data)
                    page += 1
                
                return all_data[:count], True
            
            return data, True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"API请求失败 (尝试 {attempt+1}/{MAX_RETRY_ATTEMPTS}): {str(e)}")
            
            # 如果代理失败，尝试直接访问
            if use_proxy and USE_PROXY and attempt == 0:
                logger.info("代理请求失败，尝试直接访问")
                return fetch_github_data(repo, data_type, count, False)
            
            # 等待后重试
            time.sleep(5)
            
    logger.error(f"在{MAX_RETRY_ATTEMPTS}次尝试后获取数据失败")
    return None, False