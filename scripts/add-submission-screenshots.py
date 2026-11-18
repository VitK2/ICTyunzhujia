"""Insert authentic UI captures into a copy of the existing competition form."""
from pathlib import Path
import hashlib, json, zipfile
from PIL import Image
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'docs/【赛题1】创新赛作品信息收集表_云筑家_提交初稿_20261116.docx'
OUT=ROOT/'docs/【赛题1】创新赛作品信息收集表_云筑家_界面截图完善版_20261116.docx'
TMP=ROOT/'.local/submission-20261116'
RAW=TMP/'screenshots'
ASSETS=ROOT/'docs/submission-screenshots-20261116'
ASSETS.mkdir(exist_ok=True)
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
# All boxes use pixels of the observed 2560x1392 browser captures.
# Only crop: no generated imagery, rewritten text, or retouching.
crops=[
 ('01-render-day-full.png','01-3d-day.png',(385,175,2205,1220)),
 ('02-recommend-full.png','02-recommend-sofa.png',(2251,660,2527,879)),
 ('02-recommend-full.png','03-recommend-table.png',(2251,886,2527,1105)),
 ('05-layout-top-full.png','04-layout-top.png',(800,325,1750,1100)),
 ('04-layout-tools-full.png','05-layout-tools.png',(2251,740,2527,1023)),
 ('07-render-settings-full.png','06-3d-night-materials.png',(416,286,2198,1161)),
]
manifest=[]
for raw,name,box in crops:
    im=Image.open(RAW/raw)
    assert im.size==(2560,1392)
    im.crop(box).save(ASSETS/name)
    manifest.append({'source':raw,'output':name,'crop_box':box,'sha256':hashlib.sha256((ASSETS/name).read_bytes()).hexdigest()})

doc=Document(SOURCE)
table=doc.tables[0]
# Update only the obsolete browser-QA clause; previous metrics remain unchanged.
old='浏览器三维显示尚未完成自动化视觉验收。'
new='本次已在Edge实际工作台完成家具推荐、锁定沙发后修改布局、俯视切换及日夜光影预览检查；尚未覆盖所有浏览器和渲染参数组合。'
matches=0
for p in table.rows[14].cells[1].paragraphs:
    for run in p.runs:
        if old in run.text:
            run.text=run.text.replace(old,new); matches+=1
assert matches==1

cell=table.rows[15].cells[1]
cell._tc.clear_content();cell.add_paragraph()
def para(text,bold=False,size=10.5):
    p=cell.paragraphs[0] if len(cell.paragraphs)==1 and not cell.paragraphs[0].text else cell.add_paragraph()
    p.paragraph_format.space_before=Pt(0);p.paragraph_format.space_after=Pt(5)
    p.paragraph_format.line_spacing=1.2;p.paragraph_format.keep_with_next=bold
    p.paragraph_format.keep_together=True
    snap=OxmlElement('w:snapToGrid');snap.set(qn('w:val'),'0');p._p.get_or_add_pPr().append(snap)
    r=p.add_run(text);r.font.name='微软雅黑';r._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'微软雅黑')
    r.font.size=Pt(size);r.bold=bold;r.font.color.rgb=RGBColor(0,0,0)
    return p
def pictures(items,caption):
    p=cell.add_paragraph();p.paragraph_format.space_after=Pt(2);p.paragraph_format.keep_with_next=True
    for i,(name,width) in enumerate(items):
        if i:p.add_run('  ')
        r=p.add_run();r.add_picture(str(ASSETS/name),width=Inches(width))
        r._r.xpath('.//wp:docPr')[0].set('descr',caption)
    p=para(caption,size=9);p.paragraph_format.space_after=Pt(8)

para('实际界面演示',True)
para('演示环境：2026年11月16日，Microsoft Edge，本地运行地址http://127.0.0.1:5174/。工作台显示“DeepSeek · 已连接”。以下均为当前项目实际操作截图，裁去浏览器标签栏和无关区域；并排展示的局部截图分别注明内容。')
para('1 三维客厅与自然日光',True)
pictures([('01-3d-day.png',6.0)],'图4 实际三维客厅：带纹理家具、木纹地板、墙面、地毯与窗光阴影；下方显示基础空间检查通过。')
para('2 需求驱动的家具推荐',True).paragraph_format.space_before=Pt(20)
para('输入演示需求“预算8000元、偏好木质、阅读和会客，本轮仅推荐”。Agent保存需求，返回KLIPPAN沙发与LACK茶几两张卡片，原有家具摆放保持不变。卡片列出历史参考价、尺寸、推荐依据、待核验条件，以及加入或替换入口。两件历史参考价合计1648元；材质偏好仍需核实，且场景5件家具未定价，不能确认整体预算。')
pictures([('02-recommend-sofa.png',2.90),('03-recommend-table.png',2.90)],'图5 实际推荐卡片局部截图，按原样裁剪并排：左为沙发（1449元），右为茶几（199元）；均为历史参考价。')
para('3 保留锁定家具并修改布局',True)
para('继续输入“锁定当前沙发，保留5件家具，按阅读需求重新布置并校验”。页面更新为“窗边阅读”，沙发保留在(2.55,0.72)、朝向180°；休闲椅、茶几和边几等按阅读布局调整。执行记录依次包含get_scene、lock_furniture、generate_layout和两次validate_layout，均成功；空间问题0项，5件家具仍未定价。')
pictures([('04-layout-top.png',3.40),('05-layout-tools.png',2.45)],'图6 布局俯视图（左）与同次工具记录（右）；保留5件家具，空间问题0项。')
para('4 夜间光影与材质设置',True).paragraph_format.space_before=Pt(20)
pictures([('06-3d-night-materials.png',6.0)],'图7 同一阅读布局切换为夜间室内光，展开实际光影与材质面板；可见清漆木纹、暖白墙面、亮度与阴影参数。')
para('上述显示为当前开放家具素材的三维预览，未将模型外观绑定到推荐商品SKU；推荐商品仍采用尺寸示意模型。光影效果用于布置预览，不构成实测照度或专业照明设计结果。')
para('演示与复现',True)
para('双击项目根目录“启动云筑家.cmd”，打开本机5174端口。原独立API联调报告为.local/live-agent-report.json，复现脚本为scripts/check-live-agent.mjs，测试命令为pnpm test。界面截图演示与前述报告属于不同轮次，不将报告的耗时标注到本次界面操作。当前地址仅本机可访问，不能作为公网作品链接。')
para('提交前仍需补齐团队信息与合照、CodeArts开发证据、Skills关联华为云服务记录、华为云部署和公网链接，并录制完整演示视频。')

working=TMP/'screenshots-working.docx';doc.save(working)
editable={'word/document.xml','word/_rels/document.xml.rels','[Content_Types].xml'}
with zipfile.ZipFile(SOURCE) as src,zipfile.ZipFile(working) as edited,zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as out:
    for name in edited.namelist():out.writestr(name,edited.read(name) if name in editable or name not in src.namelist() else src.read(name))
with zipfile.ZipFile(SOURCE) as src,zipfile.ZipFile(OUT) as out:
    assert all(src.read(n)==out.read(n) for n in src.namelist() if n not in editable)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
final=Document(OUT)
assert len(final.tables)==1 and len(final.tables[0].rows)==16
for i in range(15):
    if i==14:continue
    assert table.rows[i]._tr.xml==final.tables[0].rows[i]._tr.xml
assert [p.text for p in Document(SOURCE).paragraphs]==[p.text for p in final.paragraphs]
audit={'output':str(OUT),'source_sha256':source_hash,'retained_source_unchanged':True,'unchanged_rows':'0-13','modified_rows':[14,15],'screenshots':manifest,'source_size':len(SOURCE.read_bytes()),'output_size':len(OUT.read_bytes())}
(TMP/'screenshot-authoring-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'output':str(OUT),'embedded_actual_screenshot_crops':len(crops),'source_unchanged':True},ensure_ascii=False))
