"""Fill a copy of the official form using current code and verified project evidence."""
from pathlib import Path
import copy, hashlib, io, json, textwrap, zipfile
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[1]
REF=Path('D:/liquanquan/【赛题1-模板1】创新赛-作品信息收集表-学校-队名-队长姓名-手机号 （初赛阶段）.docx')
TMP=ROOT/'.local/submission-20261116';TMP.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'docs/【赛题1】创新赛作品信息收集表_云筑家_提交初稿_20261116.docx'
FONT='C:/Windows/Fonts/msyh.ttc'
def f(n):return ImageFont.truetype(FONT,n)
def wrap_pixels(text,font,width):
    result=[];line=''
    for ch in text:
        if font.getlength(line+ch)>width and line:result.append(line);line=''
        line+=ch
    result.append(line);return result

# All figures derive from existing project files. They are deliberately not called UI screenshots.
im=Image.new('RGB',(1500,850),'white');draw=ImageDraw.Draw(im)
draw.text((30,20),'当前家具素材几何预览',font=f(38),fill='#233a2b')
ids=[('sofa_02','双人沙发'),('modern_coffee_table_01','茶几'),('modern_wooden_cabinet','储物柜'),('modern_arm_chair_01','休闲椅'),('side_table_01','边几'),('wooden_bookshelf_worn','书架')]
for n,(asset,label) in enumerate(ids):
    x=30+n%3*490;y=85+n//3*350
    tile=Image.open(ROOT/'public/previews'/f'{asset}.png').convert('RGB');tile.thumbnail((450,280));im.paste(tile,(x+(450-tile.width)//2,y))
    draw.text((x+15,y+284),label,font=f(27),fill='#344839')
draw.text((30,795),'来源 public/previews 原有图像；此图为未贴图几何预览，不代表当前PBR场景效果',font=f(23),fill='#6b756b')
im.save(TMP/'asset-preview.png')

report=json.loads((ROOT/'.local/live-agent-report.json').read_text(encoding='utf-8'))
im=Image.new('RGB',(1500,720),'white');draw=ImageDraw.Draw(im)
draw.text((35,25),'DeepSeek真实API联调结果',font=f(40),fill='#233a2b')
draw.text((35,85),'模型 deepseek-flash    独立测试房间 5.6 × 4.8米    预算8000元',font=f(27),fill='#5b6a58')
rows=[('真实模型推荐家具','返回2件目录候选，原摆放不变','5.493秒'),('真实模型修改布局','生成阅读布局，锁定沙发位置不变','4.847秒'),('应用推荐茶几','替换后重新布置，几何问题0项','0.009秒')]
for i,(title,result,time) in enumerate(rows):
    y=150+i*135;draw.rounded_rectangle((30,y,1470,y+115),10,fill='#f0f4ec');draw.text((50,y+14),title,font=f(30),fill='#294a32');draw.text((50,y+62),result,font=f(27),fill='#596e50');draw.text((1265,y+34),time,font=f(29),fill='#35583c')
draw.text((35,580),'已知参考价199元，另有4件未定价；第三步由确定性工具执行，不再调用模型。',font=f(25),fill='#656f61')
draw.text((35,628),'依据 .local/live-agent-report.json  2026-11-16；本图由真实报告整理，非网页截图。',font=f(23),fill='#75806e')
im.save(TMP/'live-results.png')

im=Image.new('RGB',(1500,730),'white');draw=ImageDraw.Draw(im)
draw.text((35,20),'云筑家当前运行架构',font=f(40),fill='#233a2b')
boxes=[(35,110,460,260,'浏览器工作台',['React 与 Three.js','需求档案 三维编辑 方案管理']), (530,110,960,260,'Node.js业务后端',['请求校验 工具白名单','候选事务 版本检查']), (1030,110,1465,260,'DeepSeek真实API',['需求理解 工具选择','Function Calling']), (270,350,760,510,'家具与空间工具',['真实目录检索 推荐 替换','预算 几何校验 布局搜索']), (825,350,1315,510,'本地数据与证据',['30件GLB 5条商品资料','39项测试 真实API联调报告'])]
for x1,y1,x2,y2,title,lines in boxes:
    draw.rounded_rectangle((x1,y1,x2,y2),12,fill='#f1f4ee',outline='#98af93',width=2);draw.text((x1+20,y1+18),title,font=f(31),fill='#2f4d34')
    for j,line in enumerate(lines):draw.text((x1+20,y1+65+j*37),line,font=f(24),fill='#65765d')
for a,b in [((460,185),(530,185)),((960,185),(1030,185)),((730,260),(560,350)),((745,260),(1040,350))]:
    draw.line([a,b],fill='#608359',width=4);x,y=b;draw.polygon([(x,y),(x-12,y-10),(x+4,y-13)],fill='#608359')
draw.rounded_rectangle((35,575,1465,680),10,fill='#faf5e9',outline='#c9bda4',width=2)
draw.text((55,590),'赛题落实计划',font=f(28),fill='#776243');draw.text((55,633),'CodeArts开发记录、Skills关联云服务及华为云部署尚待完成；不计入当前运行架构。',font=f(25),fill='#776243')
im.save(TMP/'architecture.png')

def code_figure(path,start_pattern,end_pattern,name):
    lines=(ROOT/path).read_text(encoding='utf-8').splitlines();a=next(i for i,l in enumerate(lines) if start_pattern in l);b=next(i for i in range(a,len(lines)) if end_pattern in lines[i])+1
    content=[]
    for n in range(a,b):
        chunks=wrap_pixels(lines[n],f(24),1030)
        for j,chunk in enumerate(chunks):content.append((str(n+1) if j==0 else '',chunk))
    im=Image.new('RGB',(1150,112+len(content)*34),'#f7f8f5');dr=ImageDraw.Draw(im)
    dr.text((22,18),f'{path}  L{a+1}—L{b}',font=f(27),fill='#2c4c32');dr.line((20,70,1130,70),fill='#cbd7c4',width=2)
    for n,(num,line) in enumerate(content):
        dr.text((18,88+n*34),num,font=f(21),fill='#8d9a84');dr.text((87,88+n*34),line,font=f(24),fill='#293b2d')
    im.save(TMP/name);return f'{path} 第{a+1}—{b}行（仅按图片宽度折行，代码未改写）'
code1=code_figure('server/agent.ts','for(let round=0;','messages.push(m);','agent-code.png')
code2=code_figure('server/apply.ts',' const box=createToolbox',' if(totals(result.plan,products).exceeded)','apply-code.png')

d=Document(REF);table=d.tables[0]
def reset(cell):
    cell._tc.clear_content();cell.add_paragraph();return cell
def para(cell,text,bold=False,size=10.5):
    p=cell.paragraphs[0] if len(cell.paragraphs)==1 and not cell.paragraphs[0].text else cell.add_paragraph()
    p.paragraph_format.space_before=Pt(0);p.paragraph_format.space_after=Pt(5);p.paragraph_format.line_spacing=1.2;p.paragraph_format.keep_with_next=bold
    p.paragraph_format.keep_together=True
    snap=OxmlElement('w:snapToGrid');snap.set(qn('w:val'),'0');p._p.get_or_add_pPr().append(snap)
    r=p.add_run(text);r.font.name='微软雅黑';r._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'微软雅黑');r.font.size=Pt(size);r.bold=bold;r.font.color.rgb=RGBColor(0,0,0)
    return p
def image(cell,name,caption,width=6.0):
    p=cell.add_paragraph();p.paragraph_format.space_after=Pt(2);p.paragraph_format.keep_with_next=True;p.add_run().add_picture(str(TMP/name),width=Inches(width))
    cap=para(cell,caption,size=9);cap.paragraph_format.space_after=Pt(8)
for i,text in [(1,'待补充'),(2,'待确认'),(5,'待补充'),(6,'待补充')]:para(reset(table.rows[i].cells[1]),text)
row=table.rows[4]
for i,text in [(1,'待补充'),(2,'待补充（队长）'),(3,'待补充'),(4,'待补充')]:para(reset(row.cells[i]),text)
photo=reset(table.rows[7].cells[1]);para(photo,'待补充1张约2MB的真实团队合照。')
for _ in range(5):photo.add_paragraph()
para(reset(table.rows[10].cells[1]),'云筑家 面向家居选购与三维布置的需求驱动智能体')
para(reset(table.rows[11].cells[1]),'生活应用、家居零售与室内空间布置辅助')
c=table.rows[12].cells[1];existing=[p.text for p in c.paragraphs if p.text.strip()];reset(c)
para(c,'赛题指定技术要求',True)
for t in existing:para(c,t)
para(c,'当前实现与落实状态',True)
para(c,'现有系统采用React、TypeScript、Three.js与Node.js，已通过DeepSeek真实API完成需求理解、家具推荐及布局修改，具备PBR材质、光影预览和几何校验。CodeArts使用记录、已有智能体及Skills关联云服务、华为云部署与MaaS调用尚待完成，当前成果不替代上述赛题要求。')

background='家具选购需要同时考虑预算、尺寸、偏好和日常活动，但商品页面难以直观呈现家具放入实际空间后的占地、搭配和冲突。云筑家面向家居换新与首次布置用户，将需求档案、可解释推荐、智能体工具调用和可编辑三维场景结合。用户提供预算、住房城市或区域、家具偏好及生活需求，系统从有来源的本地目录推荐候选，展示历史参考价与待核验条件；经用户选择后加入或替换家具，生成阅读、会客或活动空间布局，并检查越界、重叠、门扇及预留区，保留锁定家具。系统已支持真实模型驱动的推荐与修改、三维手动编辑、光影材质切换、方案保存比较和JSON导出。目标是减少商品比选与反复摆放的操作负担，使用效率和满意度仍需用户测试验证。首版限定矩形单客厅；城市不用于推断实时库存或配送能力。'
practice='当前成果：团队已形成可运行的本地原型，采用DeepSeek官方API进行真实工具调用，完成需求档案、家具推荐、布局搜索、几何校验、三维交互与方案管理。39项自动化测试及真实接口链路已通过。上述成果用于验证产品可行性，不作为华为云产品使用证据。\n赛题落实计划：使用华为云码道CodeArts代码智能体承接现有仓库，在后续需求迭代中保留真实研发记录。需求理解环节，围绕推荐依据、预算边界和锁定保护拆分任务，明确数据、接口和验收条件；代码生成与构建环节，辅助开发后续户型导入或数据扩充模块，执行类型检查、构建和回归测试，由团队评审代码；问题修复环节，基于实际失败用例分析模型工具格式、布局不可行及资源加载问题，记录修复前后的测试结果；部署上线环节，借助已有智能体和Skills开通、配置项目实际需要的RDS、Redis等服务，拟用ECS运行应用、OBS存储模型资产，并接入华为云MaaS完成独立联调。\n开发证据将包括CodeArts任务与对话、代码提交、测试报告、云服务配置及调用、部署日志和可访问链接；涉及账号与密钥的信息需脱敏。通过记录同类任务耗时、缺陷修复和部署步骤说明“想法到应用”的实践价值，未测得的数据不填写提效或降本比例。当前尚无可核实的CodeArts使用与华为云部署记录，提交前需按赛题要求补齐，DeepSeek联调不能替代该部分。'
assert len(background)<=500 and len(practice)<=1000
c=reset(table.rows[13].cells[1]);para(c,'1 方案的背景和价值（500字以内）',True);para(c,background);para(c,'2 华为云产品使用价值与开发实践（1000字以内）',True)
for t in practice.split('\n'):para(c,t)

c=reset(table.rows[14].cells[1]);para(c,'1 整体技术方案',True)
para(c,'浏览器工作台负责需求输入、三维交互和方案保存；Node.js后端读取可信目录，校验请求并执行白名单工具；DeepSeek通过Function Calling选择工具和解释结果。家具尺寸、金额与几何结果由程序计算，模型不直接编造商品或判定空间可行性。候选通过格式、预算、几何及锁定检查后才应用；处理期间若用户已修改场景，则旧结果不会覆盖新方案。')
image(c,'architecture.png','图1 当前运行架构与赛题待落实部分')
para(c,'2 关键技术模块',True)
modules=[('模块1 需求档案与家具推荐','保存预算、城市区域、家具偏好、生活需求、布局重点和选购范围；按真实目录、名称关键词、尺寸外框和已知预算筛选候选。推荐卡片说明依据和未核验条件，只有用户选择后才加入或替换。城市配送、门店库存、运费及未标注材质不作推断。对应src/brief.ts、server/recommend.ts及src/RecommendationCards.tsx。'),('模块2 智能体工具调用','通过HTTPS调用DeepSeek官方接口，支持多轮工具请求与执行结果回填，限定8轮模型请求和24次工具调用。工具白名单覆盖需求更新、检索推荐、锁定、增删替换、布局生成与校验。界面支持密钥配置和连接测试；密钥由本机后端保存，不回显、不写入方案文件。对应server/agent.ts、server/tools.ts和server/model-settings.ts。'),('模块3 布局搜索与事务应用','依据留白、会客或阅读偏好搜索候选位置和角度，使用同一几何校验器检查边界、占地重叠、门扇和预留区。锁定家具不得改动；替换预算会扣除旧家具金额。未找到可行布局、超出已知预算或校验失败时不应用候选。对应src/engine.ts和server/apply.ts。'),('模块4 三维交互与物理材质','基于Three.js加载30件带纹理GLB，支持选择、移动、旋转、锁定、删除及二维兼容；增加地板、墙面与织物PBR材质、HDR环境光、GTAO遮蔽、日光及夜间光线，支持清漆、哑光、墙面色与阴影强度调节。真实商品采用尺寸示意模型，不能代表实物外观。对应src/Scene.tsx与src/rendering.ts。'),('模块5 数据来源与方案管理','整理30件CC0三维素材、5条宜家官方商品事实及10个房间材质/HDR资源，保存来源、历史价格与文件校验和。5条商品中4件支持落地摆放，开放模型尚未绑定真实商品。支持撤销、最多6套快照、比较、JSON导入导出及需求档案恢复。')]
for title,body in modules:para(c,title,True);para(c,body)
para(c,'3 当前代码摘录',True);image(c,'agent-code.png','图2 '+code1);image(c,'apply-code.png','图3 '+code2)
para(c,'4 已达到的效果与验证范围',True)
metrics=['自动化验证：39项测试通过，覆盖几何与预算、锁定保护、推荐条件、候选回滚、配置存储及密钥隔离；TypeScript检查和生产构建通过。此结果不是独立用户评测准确率。','资源验证：30件GLB、30张目录预览和10个新增材质/HDR文件的HTTP及哈希检查通过。','真实模型推荐：独立5.6×4.8米测试房间，预算8000元，返回2件真实目录候选，原摆放不变；本次耗时5.493秒。','真实模型布局修改：生成阅读布局，保留全部家具和锁定沙发位置，几何冲突0项；本次耗时4.847秒。','推荐茶几应用：替换后重新布置，几何冲突0项，保留需求档案；本次耗时0.009秒，该步骤不再调用模型。已知参考金额199元，另4件未定价，不能据此确认整体预算。','当前边界：未完成完整通道可达性、施工规范、水电或承重判断；尚无用户效率、满意度及成本改善的对照测量。上述为单次联调耗时，不代表平均性能；浏览器三维显示尚未完成自动化视觉验收。']
for t in metrics:para(c,t)

c=reset(table.rows[15].cells[1]);para(c,'当前可提供的作品证据',True)
para(c,'本地演示地址：http://127.0.0.1:5174/（仅本机可访问，不能作为公网作品链接）。启动方式：双击项目根目录“启动云筑家.cmd”。真实联调报告：.local/live-agent-report.json；复现脚本：scripts/check-live-agent.mjs；39项测试命令：pnpm test。')
image(c,'asset-preview.png','图4 当前项目原有家具几何预览（不是网页或PBR场景截图）')
image(c,'live-results.png','图5 依据真实API报告整理的联调结果图（不是网页截图）')
para(c,'界面截图与提交前补充项',True)
para(c,'当前界面截图连接超时，未将示意图充当网页截图。待补：工作台与PBR场景、需求与推荐卡片、布局修改及工具记录三类实际截图；录制需求输入—推荐—替换—布局校验—保存方案演示视频。涉及模型配置时仅展示“已连接”状态，不展示密钥。')
para(c,'仍需补齐团队信息与合照、CodeArts开发证据、Skills关联华为云服务记录、华为云部署及公网链接。此稿供审核完善，尚不表示已满足全部提交条件。')

# The source's oversized empty cell heights are minimum heights, not fixed text containers.
for row in table.rows:
    for tc in row._tr.findall(qn('w:trPr')):
        for child in list(tc):
            if child.tag in [qn('w:cantSplit'),qn('w:trHeight')]:tc.remove(child)
# Keep the source cover and its paragraphs unchanged; the date is in the filename.
temp=TMP/'working.docx';d.save(temp)
# Preserve every unrelated template part byte-for-byte.
editable={'word/document.xml','word/_rels/document.xml.rels','[Content_Types].xml'}
with zipfile.ZipFile(REF) as original,zipfile.ZipFile(temp) as edited,zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as final:
    for name in edited.namelist():final.writestr(name,edited.read(name) if name in editable or name not in original.namelist() else original.read(name))
with zipfile.ZipFile(REF) as a,zipfile.ZipFile(OUT) as b:
    assert all(a.read(n)==b.read(n) for n in a.namelist() if n not in editable)
audit={'output':str(OUT),'background_chars':len(background),'development_chars':len(practice),'source_sha256':hashlib.sha256(REF.read_bytes()).hexdigest(),'figures':5,'template_parts_preserved':True,'gui_screenshots':'pending due to CUA connection timeout'}
(TMP/'authoring-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(audit,ensure_ascii=False))
