import os
import time
import requests
import logging
import hashlib
import json
from datetime import datetime

# 环境变量配置
AFDIAN_USER_ID = os.environ.get('AFDIAN_USER_ID', '')
AFDIAN_TOKEN = os.environ.get('AFDIAN_TOKEN', '')
AFDIAN_API_URL = "https://afdian.com/api/open/query-sponsor"

# API限制相关参数
MAX_RETRY_ATTEMPTS = 3

logger = logging.getLogger('afdian-api')

def generate_sign(params, ts, user_id, token):
    """
    生成爱发电API签名
    签名规则: md5(token+请求数据按key排序拼接key和value)
    简化为: md5(token+params{params}+ts{ts}+user_id{user_id})
    """
    sign_str = f"{token}params{params}ts{ts}user_id{user_id}"
    return hashlib.md5(sign_str.encode('utf-8')).hexdigest()

def fetch_afdian_sponsors():
    """获取爱发电赞助者数据"""
    if not AFDIAN_USER_ID or not AFDIAN_TOKEN:
        logger.error("未配置爱发电API凭证，请设置AFDIAN_USER_ID和AFDIAN_TOKEN环境变量")
        return None, False
    
    logger.info("获取爱发电赞助者数据")
    
    all_sponsors = []
    current_page = 1
    total_page = 1
    
    while current_page <= total_page:
        try:
            # 准备请求参数
            ts = str(int(time.time()))
            params = json.dumps({"page": current_page})
            
            # 生成签名
            sign = generate_sign(params, ts, AFDIAN_USER_ID, AFDIAN_TOKEN)
            
            # 准备请求数据
            request_data = {
                "user_id": AFDIAN_USER_ID,
                "params": params,
                "ts": ts,
                "sign": sign
            }
            
            # 发送请求
            for attempt in range(MAX_RETRY_ATTEMPTS):
                try:
                    response = requests.post(AFDIAN_API_URL, json=request_data, timeout=30)
                    response.raise_for_status()
                    
                    data = response.json()
                    
                    # 检查返回码
                    if data.get('ec') != 200:
                        logger.error(f"爱发电API返回错误: {data.get('em', '未知错误')}")
                        return None, False
                    
                    # 提取数据
                    result_data = data.get('data', {})
                    sponsors = result_data.get('list', [])
                    all_sponsors.extend(sponsors)
                    
                    # 更新总页数
                    total_page = result_data.get('total_page', 1)
                    
                    # 退出重试循环
                    break
                
                except requests.exceptions.RequestException as e:
                    logger.error(f"API请求失败 (尝试 {attempt+1}/{MAX_RETRY_ATTEMPTS}): {str(e)}")
                    if attempt < MAX_RETRY_ATTEMPTS - 1:
                        time.sleep(5)
                    else:
                        return None, False
            
            # 进入下一页
            current_page += 1
            
            # 如果有多页，等待一秒避免请求过快
            if current_page <= total_page:
                time.sleep(1)
            
        except Exception as e:
            logger.error(f"处理爱发电数据时出错: {str(e)}")
            return None, False
    
    # 计算每个赞助者的总金额并分类
    sponsors_classified = classify_sponsors(all_sponsors)
    return sponsors_classified, True

def classify_sponsors(sponsors):
    """
    将赞助者按捐款金额分类
    铜牌: 0-1000元
    银牌: 1001-10000元
    金牌: 10001元以上
    
    注意：排除all_sum_amount为0的赞助者，这些可能是退款或使用了兑换码
    """
    bronze_sponsors = []  # 铜牌赞助商 (0-1000元)
    silver_sponsors = []  # 银牌赞助商 (1001-10000元)
    gold_sponsors = []    # 金牌赞助商 (10001元以上)
    
    for sponsor in sponsors:
        # 从all_sum_amount获取累计赞助金额
        try:
            amount = float(sponsor.get('all_sum_amount', '0.00'))
        except (ValueError, TypeError):
            # 如果金额不是有效数字，设为0
            amount = 0.0
        
        # 跳过金额为0的赞助者（可能是退款或使用了兑换码）
        if amount <= 0:
            logger.info(f"跳过金额为0的赞助者: {sponsor.get('user', {}).get('name', '未知赞助者')}")
            continue
        
        # 按金额分类
        sponsor_info = {
            'user_id': sponsor.get('user', {}).get('user_id', ''),
            'name': sponsor.get('user', {}).get('name', '未知赞助者'),
            'avatar': sponsor.get('user', {}).get('avatar', ''),
            'amount': amount,
            'create_time': sponsor.get('create_time', 0),
            'last_pay_time': sponsor.get('last_pay_time', 0)
        }
        
        if amount >= 10001:
            gold_sponsors.append(sponsor_info)
        elif amount >= 1001:
            silver_sponsors.append(sponsor_info)
        else:
            bronze_sponsors.append(sponsor_info)
    
    # 按捐款金额从高到低排序
    gold_sponsors.sort(key=lambda x: x['amount'], reverse=True)
    silver_sponsors.sort(key=lambda x: x['amount'], reverse=True)
    bronze_sponsors.sort(key=lambda x: x['amount'], reverse=True)
    
    return {
        'gold': gold_sponsors,
        'silver': silver_sponsors,
        'bronze': bronze_sponsors
    } 