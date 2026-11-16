import type { ReactNode } from "react";
import { Check, Rocket, X } from "lucide-react";
import type { Notice } from "../app/workspace";

export function NoticeView({ notice }: { notice: Notice }) {
  return <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}><span>{notice.kind === "success" ? <Check size={16} /> : <X size={16} />}</span>{notice.message}</div>;
}

export function PageTitle({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function DataTable({ columns, rows, empty }: { columns: string[]; rows: string[][]; empty: string }) {
  return rows.length
    ? <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
    : <p className="empty-text">{empty}</p>;
}

export function NotPublished() {
  return <div className="empty-inline"><Rocket size={21} /><p>Nothing is published in this environment yet. Publish the configuration in Project settings to use these services.</p></div>;
}

export function Panel({ title, subtitle, icon, children, className = "" }: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{icon}</div>{children}</section>;
}

/** An inline field-level validation message, linked to its input by id. */
export function FieldIssue({ id, message }: { id: string; message?: string }) {
  return message ? <small className="field-issue" id={id} role="alert">{message}</small> : null;
}
