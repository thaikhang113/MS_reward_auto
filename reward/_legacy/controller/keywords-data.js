// =============================================
// SEARCH KEYWORDS - FLATTENED LIST
// All keywords in Vietnamese for Bing Rewards
// Format: Single array for simple random selection
// Total: 500+ keywords
// =============================================

// Using ES6 export default for compatibility
const KEYWORDS = [
    // Tin tức & Thời sự (25)
    'tin tức hôm nay', 'tin tức 24h', 'thời sự việt nam', 'tin thế giới', 'tin kinh tế',
    'tin pháp luật', 'tin giáo dục', 'tin y tế', 'tin xã hội', 'tin văn hóa',
    'tin thể thao', 'tin nóng hôm nay', 'báo mới nhất', 'tin trong nước',
    'tin nước ngoài', 'tin chính trị', 'tin an ninh', 'tin quân sự',
    'tin tai nạn giao thông', 'tin môi trường', 'tin biến đổi khí hậu',
    'tin công nghệ 2026', 'tin tức 2027', 'dự báo 2026', 'xu hướng 2027',

    // Thời tiết (20)
    'thời tiết hà nội', 'thời tiết sài gòn', 'thời tiết đà nẵng', 'thời tiết hôm nay',
    'dự báo thời tiết', 'thời tiết tuần này', 'thời tiết việt nam', 'thời tiết miền bắc',
    'thời tiết miền nam', 'thời tiết miền trung', 'thời tiết cần thơ', 'thời tiết huế',
    'thời tiết nha trang', 'thời tiết vũng tàu', 'thời tiết hải phòng',
    'thời tiết 7 ngày', 'thời tiết tháng này', 'thời tiết tết 2027',
    'áp thấp nhiệt đới', 'bão việt nam',

    // Công nghệ (40)
    'công nghệ mới 2026', 'công nghệ 2027', 'tin công nghệ', 'điện thoại mới nhất',
    'laptop gaming', 'laptop văn phòng', 'laptop sinh viên', 'máy tính bảng',
    'tai nghe bluetooth', 'loa bluetooth', 'smartwatch', 'vòng đeo tay thông minh',
    'camera an ninh', 'tivi thông minh', 'tivi 4k', 'tivi 8k',
    'điện thoại samsung', 'điện thoại iphone', 'điện thoại xiaomi', 'điện thoại oppo',
    'điện thoại vivo', 'điện thoại realme', 'iphone 16', 'samsung galaxy s26',
    'ai việt nam', 'trí tuệ nhân tạo', 'chatgpt tiếng việt', 'robot ai',
    'iot smart home', 'nhà thông minh', 'đèn thông minh', 'ổ cắm thông minh',
    'sạc dự phòng', 'chuột gaming', 'bàn phím cơ', 'màn hình máy tính',
    'pc gaming', 'card đồ họa', 'drone giá rẻ', 'máy ảnh không gương lật',

    // Du lịch (35)
    'du lịch đà nẵng', 'du lịch phú quốc', 'du lịch nha trang', 'du lịch đà lạt',
    'du lịch sapa', 'du lịch hạ long', 'du lịch việt nam', 'du lịch châu âu',
    'du lịch châu á', 'du lịch thái lan', 'du lịch singapore', 'du lịch nhật bản',
    'du lịch hàn quốc', 'du lịch mỹ', 'du lịch úc', 'du lịch pháp',
    'khách sạn đà nẵng', 'resort biển đẹp', 'tour du lịch giá rẻ',
    'du lịch tự túc', 'du lịch bụi', 'du lịch miền tây', 'du lịch miền bắc',
    'du lịch miền trung', 'du lịch côn đảo', 'du lịch cát bà', 'du lịch mù cang chải',
    'du lịch cao bằng', 'du lịch ninh bình', 'du lịch quảng bình',
    'visa du lịch', 'kinh nghiệm du lịch', 'cẩm nang du lịch', 'checkin đẹp',
    'homestay đẹp',

    // Ẩm thực (35)
    'món ăn ngon', 'công thức nấu ăn', 'món ngon hà nội', 'món ngon sài gòn',
    'cách làm phở', 'cách làm bánh', 'cách làm bánh mì', 'cách làm chả giò',
    'nhà hàng ngon', 'quán ăn đà nẵng', 'buffet giá rẻ', 'đặc sản việt nam',
    'món ăn miền bắc', 'món ăn miền nam', 'món ăn miền trung', 'món chay',
    'món ăn vặt', 'street food việt nam', 'quán ăn ngon hà nội',
    'quán ăn ngon sài gòn', 'quán cafe đẹp', 'tiệm bánh ngon',
    'cách làm bánh flan', 'cách làm sữa chua', 'cách làm trà sữa',
    'cách nấu lẩu', 'cách nấu canh', 'cách làm gà rán', 'cách làm pizza',
    'cách làm sushi', 'món âu', 'món nhật', 'món hàn', 'món thái',
    'food blogger việt nam',

    // Thể thao (30)
    'bóng đá việt nam', 'lịch thi đấu bóng đá', 'kết quả bóng đá',
    'premier league', 'world cup 2026', 'v-league', 'sea games 2027',
    'quang hải', 'công phượng', 'thể thao việt nam', 'tin thể thao hôm nay',
    'la liga', 'serie a', 'bundesliga', 'champions league',
    'đội tuyển việt nam', 'park hang seo', 'hlv troussier', 'u23 việt nam',
    'bóng đá nữ việt nam', 'tennis việt nam', 'cầu lông việt nam',
    'bơi lội việt nam', 'điền kinh việt nam', 'võ thuật việt nam',
    'muay thái', 'karate', 'taekwondo', 'boxing việt nam',
    'esports việt nam',

    // Giải trí (45)
    'phim hay 2026', 'phim hay 2027', 'phim chiếu rạp', 'phim netflix',
    'phim hàn quốc', 'phim trung quốc', 'phim hollywood', 'phim việt nam',
    'phim hành động', 'phim kinh dị', 'phim tình cảm', 'phim hài',
    'nhạc việt mới', 'bảng xếp hạng nhạc', 'ca sĩ việt nam', 'rapper việt nam',
    'game mobile hay', 'game online', 'tin game', 'liên quân mobile',
    'free fire', 'pubg mobile', 'fifa mobile', 'minecraft',
    'sơn tùng mtp', 'đen vâu', 'amee', 'hieuthuhai', 'binz',
    'rap việt', 'king of rap', 'the voice việt nam', 'vietnam idol',
    'running man việt nam', 'tv show việt nam', 'reality show',
    'kpop việt nam', 'vpop mới nhất', 'nhạc trẻ hay', 'nhạc remix',
    'nhạc edm việt nam', 'concert 2026', 'liveshow ca nhạc',
    'trailer phim mới', 'review phim', 'phim bom tấn',

    // Học tập & Làm việc (50)
    'học tiếng anh', 'học tiếng anh online', 'học ielts', 'học toeic',
    'lập trình python', 'học lập trình', 'học java', 'học javascript',
    'học reactjs', 'học nodejs', 'học flutter', 'học kotlin',
    'công việc IT', 'tuyển dụng việc làm', 'viết cv xin việc', 'mẫu cv đẹp',
    'phỏng vấn xin việc', 'kỹ năng mềm', 'excel cơ bản', 'excel nâng cao',
    'word cơ bản', 'powerpoint đẹp', 'học online miễn phí', 'khóa học miễn phí',
    'coursera tiếng việt', 'udemy giảm giá', 'học photoshop', 'học illustrator',
    'học premiere', 'học after effects', 'học autocad', 'học 3ds max',
    'học marketing', 'học seo', 'học facebook ads', 'học google ads',
    'học kế toán', 'học luật', 'thi công chức', 'thi viên chức',
    'ôn thi đại học 2026', 'ôn thi thpt 2027', 'đề thi thử', 'luyện thi toefl',
    'học bổng du học', 'du học nhật bản', 'du học hàn quốc', 'du học mỹ',

    // Sức khỏe (40)
    'sức khỏe tim mạch', 'làm đẹp da', 'giảm cân hiệu quả', 'giảm mỡ bụng',
    'tập thể dục', 'yoga tại nhà', 'yoga buổi sáng', 'ăn uống lành mạnh',
    'thực đơn ăn kiêng', 'chăm sóc da mặt', 'trị mụn', 'trị thâm',
    'chữa đau lưng', 'chữa đau đầu', 'chữa mất ngủ', 'chữa viêm họng',
    'chữa cảm cúm', 'chữa tiểu đường', 'chữa cao huyết áp', 'chữa gout',
    'tập gym tại nhà', 'bài tập giảm cân', 'bài tập tăng cơ', 'bài tập cardio',
    'chạy bộ đúng cách', 'bơi lội giảm cân', 'đạp xe đạp', 'nhảy zumba',
    'massage thư giãn', 'châm cứu', 'đông y', 'bấm huyệt',
    'vitamin tốt', 'thực phẩm chức năng', 'dinh dưỡng cho trẻ',
    'chăm sóc thai kỳ', 'chăm sóc sau sinh', 'nuôi con bằng sữa mẹ',
    'vaccine covid 2026', 'sức khỏe tâm thần',

    // Kinh doanh & Tài chính (45)
    'kinh doanh online', 'bán hàng facebook', 'bán hàng shopee', 'bán hàng lazada',
    'marketing online', 'marketing digital', 'content marketing', 'email marketing',
    'đầu tư bất động sản', 'bất động sản 2026', 'giá nhà đất', 'mua nhà trả góp',
    'chứng khoán hôm nay', 'chứng khoán việt nam', 'cổ phiếu nên mua',
    'tiền điện tử', 'bitcoin giá', 'ethereum', 'binance việt nam',
    'vàng giá bao nhiêu', 'giá vàng hôm nay', 'lãi suất ngân hàng', 'vay tín chấp',
    'mở shop online', 'dropshipping việt nam', 'affiliate marketing',
    'passive income', 'đầu tư tài chính', 'quản lý tài chính cá nhân',
    'tiết kiệm tiền', 'làm giàu', 'khởi nghiệp', 'startup việt nam',
    'kế toán thuế', 'báo cáo tài chính', 'kế hoạch kinh doanh',
    'phân tích swot', 'chiến lược marketing', 'xây dựng thương hiệu',
    'quản trị doanh nghiệp', 'nhân sự', 'tuyển dụng nhân viên',

    // Mua sắm & Thời trang (50)
    'thời trang nam', 'thời trang nữ', 'quần áo đẹp', 'áo sơ mi nam',
    'giày thể thao', 'giày da nam', 'túi xách nữ', 'đồng hồ nam', 'đồng hồ nữ',
    'mỹ phẩm chính hãng', 'son môi đẹp', 'kem chống nắng', 'serum dưỡng da',
    'sale khuyến mãi', 'shopee giảm giá', 'lazada deal hot', 'tiki khuyến mãi',
    'thời trang công sở', 'thời trang dạo phố', 'váy đầm đẹp', 'quần jean',
    'áo khoác nam', 'áo khoác nữ', 'dép sandal', 'giày boot nữ',
    'balo laptop', 'ba lô du lịch', 'vali kéo', 'ví da nam',
    'thắt lưng nam', 'kính mát', 'nón snapback', 'mũ len',
    'áo thun nam', 'quần short', 'bikini đẹp', 'đồ bơi nữ',
    'đồ ngủ nữ', 'đồ lót nam', 'trang sức nữ', 'nhẫn cưới',
    'phụ kiện thời trang', 'khăn choàng', 'găng tay', 'thắt nơ',
    'xu hướng thời trang 2026', 'xu hướng thời trang 2027', 'fashionista việt nam',

    // Xe cộ (35)
    'xe máy honda', 'xe máy yamaha', 'xe máy suzuki', 'xe máy sym',
    'ô tô giá rẻ', 'ô tô cũ', 'ô tô mới', 'xe điện 2026', 'xe điện vinfast',
    'review xe máy', 'giá xe ô tô', 'xe hơi mới nhất', 'phụ tùng xe máy',
    'honda vision', 'honda air blade', 'yamaha exciter', 'yamaha sirius',
    'ô tô toyota', 'ô tô hyundai', 'ô tô kia', 'ô tô mazda',
    'ô tô vinfast', 'ô tô mitsubishi', 'xe suv', 'xe sedan',
    'xe bán tải', 'xe 7 chỗ', 'xe 5 chỗ', 'xe máy điện',
    'bảo hiểm xe máy', 'bảo hiểm ô tô', 'đăng ký xe', 'sang tên xe',
    'sửa xe máy', 'garage ô tô', 'phụ tùng ô tô',

    // Bất động sản (25)
    'nhà đất bán', 'nhà đất cho thuê', 'căn hộ chung cư', 'biệt thự',
    'đất nền dự án', 'nhà phố', 'shophouse', 'condotel',
    'bất động sản hà nội', 'bất động sản sài gòn', 'bất động sản đà nẵng',
    'cho thuê căn hộ', 'cho thuê nhà', 'cho thuê mặt bằng',
    'giá thuê phòng trọ', 'phòng trọ sinh viên', 'căn hộ mini',
    'vinhomes', 'vinpearl', 'sun group', 'novaland',
    'tư vấn bất động sản', 'luật đất đai', 'sổ đỏ sổ hồng',
    'thủ tục mua bán nhà đất',

    // Gia đình & Trẻ em (30)
    'chăm sóc trẻ em', 'nuôi dạy con', 'đồ chơi trẻ em', 'sữa bột cho bé',
    'tã bỉm', 'xe đẩy em bé', 'nôi cũi cho bé', 'quần áo trẻ em',
    'giáo dục sớm', 'trường mầm non', 'trường tiểu học', 'gia sư',
    'bảo mẫu tại nhà', 'kỹ năng sống', 'dạy con tự kỷ',
    'dạy con đọc sách', 'sách thiếu nhi', 'phim hoạt hình',
    'khu vui chơi trẻ em', 'cách dạy con ngoan', 'cách dạy con tự lập',
    'tâm lý trẻ em', 'trẻ biếng ăn', 'trẻ chậm nói', 'vaccine cho trẻ',
    'bệnh thường gặp ở trẻ', 'chăm sóc răng miệng', 'kính cận cho trẻ',
    'thể dục cho trẻ',

    // Làm đẹp & Spa (25)
    'spa đà nẵng', 'spa hà nội', 'spa sài gòn', 'massage toàn thân',
    'chăm sóc da mặt spa', 'triệt lông vĩnh viễn', 'nâng mũi', 'cắt mí mắt',
    'tiêm filler', 'tiêm botox', 'phun xăm thẩm mỹ', 'nối mi',
    'làm móng tay', 'nail art', 'tóc đẹp 2026', 'kiểu tóc ngắn',
    'kiểu tóc dài', 'nhuộm tóc màu', 'uốn tóc', 'duỗi tóc',
    'salon tóc đẹp', 'barber shop', 'cắt tóc nam', 'tẩy tế bào chết',
    'massage mặt',

    // Giáo dục - Đào tạo (30)
    'trường đại học', 'tuyển sinh đại học 2026', 'điểm chuẩn 2026',
    'học bổng', 'cao đẳng', 'trung cấp', 'dạy nghề',
    'trung tâm ngoại ngữ', 'trung tâm tin học', 'trung tâm kế toán',
    'học viện tài chính', 'học viện ngân hàng', 'học viện ngoại giao',
    'đại học quốc gia hà nội', 'đại học bách khoa', 'đại học kinh tế',
    'đại học ngoại thương', 'đại học sư phạm', 'đại học y dược',
    'đại học fpt', 'đại học rmit', 'học viện công nghệ bưu chính viễn thông',
    'cao đẳng fpt', 'trường dân lập', 'trường công lập', 'trường chất lượng cao',
    'tư vấn nghề nghiệp', 'định hướng nghề nghiệp', 'kiểm tra năng lực',
    'đề án tuyển sinh riêng',

    // Pháp luật (20)
    'luật lao động', 'luật dân sự', 'luật hình sự', 'luật hôn nhân gia đình',
    'luật giao thông', 'luật đất đai', 'luật doanh nghiệp', 'luật thuế',
    'tư vấn pháp luật', 'luật sư tư vấn', 'thủ tục ly hôn', 'thủ tục kết hôn',
    'đăng ký kinh doanh', 'hợp đồng lao động', 'bảo hiểm xã hội',
    'bảo hiểm y tế', 'thẻ bhyt', 'quyền lợi người lao động',
    'khiếu nại tố cáo', 'luật mới 2026',

    // Nông nghiệp (15)
    'trồng rau sạch', 'trồng cây ăn quả', 'chăn nuôi', 'nuôi gà',
    'nuôi lợn', 'nuôi cá', 'thủy sản', 'nông nghiệp công nghệ cao',
    'thuốc bảo vệ thực vật', 'phân bón hữu cơ', 'máy móc nông nghiệp',
    'làm vườn tại nhà', 'vườn rau ban công', 'cây cảnh đẹp',
    'kỹ thuật canh tác',

    // Khoa học - Khám phá (20)
    'trí tuệ nhân tạo', 'khám phá vũ trụ', 'nasa', 'spacex',
    'vật lý lượng tử', 'sinh học phân tử', 'hóa học hữu cơ',
    'thiên văn học', 'khảo cổ học', 'địa chất học',
    'động vật hoang dã', 'bảo tồn thiên nhiên', 'loài nguy cấp',
    'biến đổi khí hậu', 'năng lượng tái tạo', 'năng lượng mặt trời',
    'năng lượng gió', 'công nghệ blockchain', 'metaverse',
    'thực tế ảo vr',

    // Mẹo vặt - Đời sống (25)
    'mẹo vặt cuộc sống', 'mẹo nội trợ', 'mẹo dọn nhà', 'mẹo giặt quần áo',
    'mẹo nấu ăn', 'mẹo làm đẹp', 'mẹo tiết kiệm', 'mẹo điện thoại',
    'mẹo windows', 'mẹo facebook', 'mẹo instagram', 'mẹo tiktok',
    'kiến thức bổ ích', 'thông tin hữu ích', 'lối sống tối giản',
    'sống xanh', 'zero waste', 'tái chế', 'diy handmade',
    'làm đồ thủ công', 'origami', 'vẽ tranh', 'chơi guitar',
    'chơi piano', 'học làm bánh',

    // Phong thủy - Tâm linh (15)
    'phong thủy nhà ở', 'phong thủy văn phòng', 'xem bói', 'tử vi',
    'xem tuổi xây nhà', 'hướng nhà theo tuổi', 'cây phong thủy',
    'đá phong thủy', 'vòng phong thủy', 'tượng phong thủy',
    'lịch vạn niên', 'ngày hoàng đạo', 'xem ngày tốt', 'cầu may',
    'lễ hội tâm linh',

    // Thú cưng (20)
    'chó cảnh', 'mèo cảnh', 'thức ăn chó mèo', 'phụ kiện thú cưng',
    'chăm sóc chó', 'chăm sóc mèo', 'vaccine cho chó', 'vaccine cho mèo',
    'huấn luyện chó', 'tắm chó', 'cắt tỉa lông chó', 'bệnh chó mèo',
    'thú y', 'phòng khám thú y', 'cá cảnh', 'nuôi hamster',
    'nuôi thỏ', 'nuôi chim cảnh', 'pet shop', 'cộng đồng pet',

    // Sự kiện - Lễ hội (20)
    'tết nguyên đán 2027', 'lịch nghỉ tết 2027', 'lễ hội tết',
    'lễ valentine', 'lễ 8/3', 'lễ giỗ tổ hùng vương', 'lễ 30/4',
    'lễ 1/5', 'lễ trung thu', 'lễ halloween', 'noel 2026',
    'năm mới 2027', 'countdown 2027', 'pháo hoa tết', 'hội chợ tết',
    'festival âm nhạc', 'sự kiện văn hóa', 'triển lãm', 'hội thao',
    'marathon việt nam',

    // Ngân hàng - Fintech (20)
    'vietcombank', 'agribank', 'bidv', 'techcombank', 'vietinbank',
    'mb bank', 'acb', 'tpbank', 'vpbank', 'sacombank',
    'momo', 'zalopay', 'vnpay', 'shopeepay', 'airpay',
    'chuyển tiền nhanh', 'internet banking', 'mobile banking',
    'thẻ tín dụng', 'vay tiền online',

    // Y tế - Bệnh viện (20)
    'bệnh viện bạch mai', 'bệnh viện việt đức', 'bệnh viện chợ rây',
    'bệnh viện nhi đồng', 'bệnh viện phụ sản', 'bệnh viện mắt',
    'bệnh viện răng hàm mặt', 'bệnh viện tim mạch', 'bệnh viện ung bướu',
    'phòng khám đa khoa', 'khám bệnh online', 'tư vấn sức khỏe online',
    'đặt lịch khám bệnh', 'xét nghiệm y học', 'chẩn đoán hình ảnh',
    'siêu âm 4d', 'xquang', 'ct scan', 'mri', 'nhà thuốc gần đây'
];
export default KEYWORDS;
