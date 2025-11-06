import os
import time
import logging
from datetime import datetime
from contributors import update_special_thanks_file, update_special_thanks_file_en
from changelog import update_changelog_file, update_changelog_file_en

# 环境变量配置
UPDATE_INTERVAL = int(os.environ.get('UPDATE_INTERVAL', 1800))  # 默认30分钟

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('docs-updater')

def main():
    """主函数 - 智能更新文档"""
    logger.info("启动文档更新服务")
    
    # 初始化变量
    last_update = {
        'contributors': 0,
        'contributors_en': 0,
        'releases': 0,
        'releases_en': 0
    }
    
    # 设置更新间隔 (单位：秒)
    update_intervals = {
        'contributors': 3600,     # 贡献者列表每小时更新一次
        'contributors_en': 3600,  # 英文贡献者列表每小时更新一次
        'releases': 1800,         # 发布日志每30分钟更新一次
        'releases_en': 1800       # 英文发布日志每30分钟更新一次
    }
    
    # 主循环
    while True:
        try:
            current_time = time.time()
            
            # 检查是否需要更新贡献者和赞助商列表（中文版）
            if current_time - last_update['contributors'] >= update_intervals['contributors']:
                logger.info("开始更新贡献者和赞助商列表（中文版）")
                if update_special_thanks_file():
                    last_update['contributors'] = current_time
                    logger.info("贡献者和赞助商列表（中文版）更新成功")
                else:
                    logger.warning("贡献者和赞助商列表（中文版）更新失败，将在下次更新周期重试")
            
            # 检查是否需要更新贡献者和赞助商列表（英文版）
            if current_time - last_update['contributors_en'] >= update_intervals['contributors_en']:
                logger.info("开始更新贡献者和赞助商列表（英文版）")
                if update_special_thanks_file_en():
                    last_update['contributors_en'] = current_time
                    logger.info("贡献者和赞助商列表（英文版）更新成功")
                else:
                    logger.warning("贡献者和赞助商列表（英文版）更新失败，将在下次更新周期重试")
            
            # 检查是否需要更新发布日志（中文版）
            if current_time - last_update['releases'] >= update_intervals['releases']:
                logger.info("开始更新发布日志（中文版）")
                if update_changelog_file():
                    last_update['releases'] = current_time
                    logger.info("发布日志（中文版）更新成功")
                else:
                    logger.warning("发布日志（中文版）更新失败，将在下次更新周期重试")
            
            # 检查是否需要更新发布日志（英文版）
            if current_time - last_update['releases_en'] >= update_intervals['releases_en']:
                logger.info("开始更新发布日志（英文版）")
                if update_changelog_file_en():
                    last_update['releases_en'] = current_time
                    logger.info("发布日志（英文版）更新成功")
                else:
                    logger.warning("发布日志（英文版）更新失败，将在下次更新周期重试")
            
            # 计算下一次检查前的等待时间
            next_check = min(
                last_update['contributors'] + update_intervals['contributors'],
                last_update['contributors_en'] + update_intervals['contributors_en'],
                last_update['releases'] + update_intervals['releases'],
                last_update['releases_en'] + update_intervals['releases_en']
            ) - current_time
            
            # 如果时间已经过了，立即再次检查
            if next_check <= 0:
                next_check = 10
            
            # 限制最小和最大等待时间
            next_check = max(min(next_check, 600), 30)
            
            logger.info(f"下次检查将在 {next_check:.0f} 秒后进行")
            time.sleep(next_check)
            
        except Exception as e:
            logger.error(f"更新循环出错: {str(e)}")
            time.sleep(300)  # 出错后等待5分钟再重试

if __name__ == "__main__":
    main()