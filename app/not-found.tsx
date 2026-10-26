import Link from "next/link";
export default function NotFound(){return <section className="panel empty-state"><h1>这道菜还没上桌</h1><p>页面不存在，回首页看看吧。</p><Link href="/" className="button button-primary">返回首页</Link></section>;}
