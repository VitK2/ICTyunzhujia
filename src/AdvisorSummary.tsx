import type {CustomerAssessment,LayoutReview} from './agent-client';
export default function AdvisorSummary({assessment,review}:{assessment:CustomerAssessment;review?:LayoutReview}){
 return <details className="advisor-summary"><summary>客户需求与布置复核</summary><p>预算 ¥{assessment.budget.limit.toLocaleString()} · 已知金额 ¥{assessment.budget.knownTotal.toLocaleString()} · {assessment.budget.unpriced} 件未定价</p><p>已保留原位：{assessment.locked.map(i=>i.name).join('、')||'暂未锁定家具'}</p>{assessment.questions.length>0&&<div><b>可进一步确认</b>{assessment.questions.map(q=><p key={q}>{q}</p>)}</div>}{review&&<div><p>家具占地 {review.occupancyRatio}% · 几何问题 {review.issues.length} 项</p>{review.advice.map(s=><p key={s}>{s}</p>)}<small>{review.notice}</small></div>}</details>;
}
