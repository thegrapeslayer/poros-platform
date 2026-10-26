"""Research discussion PDF. All computed values come from decision/engine."""
import io
import reportlab
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from html import escape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from . import engine as eng

def generate(profile,result,assumptions):
    fonts=Path(reportlab.__file__).parent/'fonts'
    pdfmetrics.registerFont(TTFont('RDTI',str(fonts/'Vera.ttf')))
    pdfmetrics.registerFont(TTFont('RDTI-Bold',str(fonts/'VeraBd.ttf')))
    pdfmetrics.registerFontFamily('RDTI',normal='RDTI',bold='RDTI-Bold',italic='RDTI',boldItalic='RDTI-Bold')
    stream=io.BytesIO(); styles=getSampleStyleSheet()
    for name in ['Title','Heading1','Heading2','Heading3']:styles[name].fontName='RDTI-Bold'
    styles['Heading3'].fontSize=11
    styles.add(ParagraphStyle(name='BodySmall',fontName='RDTI',fontSize=9,leading=13,spaceAfter=7,textColor=colors.HexColor('#404552')))
    styles.add(ParagraphStyle(name='SmallLink',fontName='RDTI',fontSize=8,leading=11,spaceAfter=6,wordWrap='CJK'))
    styles['Title'].textColor=colors.HexColor('#202638');styles['Title'].alignment=0
    def clean(x):return escape(str(x if x is not None else 'Not assessed')).replace('\n','<br/>')
    def p(x,style='BodySmall'):return Paragraph(clean(x),styles[style])
    story=[p('RDTI / POROS','Heading3'),p('Research action report','Title'),p(profile['name'],'Heading1'),p(f"{profile['mode'].title()} evidence | Cutoff / snapshot: {profile['snapshot']} | Last evidence update: {profile['last_updated']}"),p(f"Generated: {eng.now_iso()} | Model: {profile['model_version']} | Cohort: {profile['cohort_id']} ({profile['cohort_size']} diseases)"),p('For research-team discussion. Hypothetical changes are model inputs, not predicted effects of conducting a study.')]
    def table(rows,widths):
        t=Table([[p(c) for c in row] for row in rows],colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf0f8')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#cdd3df')),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#e3e6ec')),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),5)]));story.append(t)
    story.append(p('Baseline and hypothetical assessment','Heading2'))
    rows=[['Assessment','Baseline','Scenario'],['Translation risk (lower is better)',result['baseline']['trs'],result['scenario']['trs']],['Readiness display (100 minus risk)',result['baseline']['readiness'],result['scenario']['readiness']]]
    rows += [['Inputs assessed (%)',result['baseline']['ascertainment_completeness'],result['scenario']['ascertainment_completeness']],['Documentary evidence supported (%)',result['baseline']['evidence_coverage'],result['scenario']['evidence_coverage']]]
    rows += [[label+' risk',result['baseline']['domains'][d],result['scenario']['domains'][d]] for d,label in eng.DOMAIN_LABELS.items()]
    table(rows,[3.5*inch,1.25*inch,1.25*inch])
    story.append(p(f"Hypothetical gaps addressed: {result['gaps_addressed']}. Domains: {', '.join(result['domains_addressed']) or 'none'}. Readiness is only the reversed display of TRS, not a separate validated index."))
    story.append(p('Selected evidence changes','Heading2'))
    if result['changes']:table([['Variable','Observed','Hypothetical']]+[[r['label'],r['baseline'],r['hypothetical']] for r in result['changes']],[3.5*inch,1.25*inch,1.25*inch])
    else:story.append(p('No hypothetical changes selected. This report records the baseline.'))
    story += [p('User-defined planning assumptions','Heading2'),p(f"Scenario name: {assumptions.get('name') or 'Untitled'}"),p(f"Estimated budget (USD): {assumptions.get('cost') if assumptions.get('cost') is not None else 'Not supplied'} | Estimated timeline (months): {assumptions.get('months') if assumptions.get('months') is not None else 'Not supplied'}"),p(assumptions.get('notes') or 'No planning notes supplied.'),p('Costs and timelines are user estimates. They are not verified costs, feasibility judgments or returns on investment.')]
    story.append(p('Evidence gaps and next research questions','Heading2'))
    for f in profile['features']:
        if f['state'] in ('supporting','assessed'):continue
        story.extend([p(f['label'],'Heading3'),p(f"State: {f['state'].replace('_',' ')}. Definition: {f['definition']}")])
        if f['activity']:story += [p(f['activity']['question']),p('Possible activity: '+f['activity']['description'])]
        story += [p(flag) for flag in f['review_flags']]
    story.append(p('All variables and scoring trace','Heading2'))
    table([['Variable','Value / evidence state','Risk']]+[[f['label'],f"{f['value']} / {f['state'].replace('_',' ')}",f['risk']] for f in profile['features']],[3*inch,2.2*inch,.8*inch])
    story.append(p('Supporting documentation','Heading2'))
    seen=set()
    for f in profile['features']:
        for r in f['records']:
            key=(r.get('url'),r.get('identifier'),r.get('query'))
            if key in seen:continue
            seen.add(key)
            title=f"{f['label']}: {r.get('title') or r.get('source')} (ID: {r.get('identifier')})"
            story += [p(title),p(f"Source date: {r.get('publication_date') or 'Not supplied'} | Retrieved: {r.get('retrieved_at') or 'Not supplied'}")]
            url=r.get('url') or ''
            if url.startswith(('https://','http://')):story.append(Paragraph(f'<link href="{escape(url,quote=True)}" color="#304cc5">{clean(url)}</link>',styles['SmallLink']))
            if r.get('snippet'):story.append(p('Recorded passage: '+r['snippet']))
    story += [p('Remaining uncertainties and limitations','Heading2')]+[p(s) for s in profile['warnings']+result['limitations']]
    story += [p(f"Archive database SHA-256: {profile['source_sha256']}",'SmallLink'),p(f"Reference fingerprint: {profile['reference_digest']}",'SmallLink'),p(f"Baseline fingerprint: {profile['baseline_token']}",'SmallLink')]
    def footer(canvas,doc):
        canvas.setFont('RDTI',8);canvas.setFillColor(colors.HexColor('#626979'));canvas.drawString(42,25,'RDTI | Research discussion only');canvas.drawRightString(570,25,f'Page {doc.page}')
    SimpleDocTemplate(stream,pagesize=(612,792),rightMargin=42,leftMargin=42,topMargin=38,bottomMargin=42,title=profile['name']+' research action report',author='RDTI / POROS').build(story,onFirstPage=footer,onLaterPages=footer)
    return stream.getvalue()
