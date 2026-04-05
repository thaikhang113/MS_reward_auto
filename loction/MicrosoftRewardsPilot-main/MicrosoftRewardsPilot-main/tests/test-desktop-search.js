// 桌面端搜索积分诊断脚本
console.log('🖥️  桌面端搜索诊断工具');
console.log('='.repeat(50));

// 使用说明
console.log('📋 诊断步骤:');
console.log('1. 运行桌面端搜索: npx tsx src/index.ts');
console.log('2. 观察以下关键日志:');
console.log('   - SEARCH-POINTS-BREAKDOWN: 查看PC/Edge积分详情');
console.log('   - SEARCH-BING-EXTRA: 额外搜索进度');
console.log('   - SEARCH-WARNING: 连续无积分警告');
console.log('');

console.log('🔍 关键指标:');
console.log('- PC搜索目标: 90分 (通常每次5分)');
console.log('- Edge搜索: 可能为0分 (不是所有账户都有)');
console.log('- 总搜索次数: 最多50次额外搜索');
console.log('- 延迟时间: 现在为120-240秒');
console.log('');

console.log('⚠️  如果积分仍然停滞:');
console.log('1. 等待24小时后重试');
console.log('2. 手动完成几次搜索测试账户状态');
console.log('3. 检查账户是否被临时限制');
console.log('');

console.log('📊 配置已优化为:');
console.log('   searchDelay: 120-240秒');
console.log('   retryMobileSearchAmount: 1');
console.log('   dynamicDelayMultiplier: 2.0');
console.log('');

console.log('🚀 开始测试: npx tsx src/index.ts'); 