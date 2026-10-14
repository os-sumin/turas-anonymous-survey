"use client";

import { useEffect, useMemo, useState } from "react";
import {
  contractMatchOptions,
  fieldCatalog,
  formatTargetFieldValue,
  getPersonalizationBlocks,
  makePersonalizationBlock,
  sourceLabel,
  targetFieldValue,
  visibleBlockFields
} from "@/lib/personalization";
import type {
  PersonalizationBlock,
  PersonalizationExcelSchema,
  PersonalizationSource,
  SurveyConfig,
  SurveyTarget
} from "@/lib/types";

type Props = {
  survey: SurveyConfig;
  password: string;
  onChange: (blocks: PersonalizationBlock[]) => void;
  onSchemaChange: (schema: PersonalizationExcelSchema, blocks: PersonalizationBlock[]) => void;
  onNotify: (message: string) => void;
};

const SOURCES: PersonalizationSource[] = ["company", "contract"];

type LoadedSchema = {
  sheetName: string;
  headerRow: number;
  columns: Array<{ key: string; sourceHeader: string }>;
  suggested: PersonalizationExcelSchema["keyColumns"];
};

export default function PersonalizationBlockEditor({ survey, password, onChange, onSchemaChange, onNotify }: Props) {
  const blocks = useMemo(() => getPersonalizationBlocks(survey), [survey]);
  const [previewTarget, setPreviewTarget] = useState<SurveyTarget>(() => exampleTarget(survey.id));
  const [previewStatus, setPreviewStatus] = useState("작성예시 데이터로 미리보기 중입니다.");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [pendingSchema, setPendingSchema] = useState<LoadedSchema | null>(null);
  const [selectedSchemaKeys, setSelectedSchemaKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPreviewTarget(exampleTarget(survey.id));
    setPreviewStatus("작성예시 데이터로 미리보기 중입니다.");
  }, [survey.id]);

  function updateBlock(blockId: string, patch: Partial<PersonalizationBlock>) {
    onChange(blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block));
  }

  function addBlock() {
    const source = SOURCES.find((item) => !blocks.some((block) => block.source === item));
    if (!source) {
      onNotify("기업정보와 기술실시계약 정보 블록이 모두 추가되어 있습니다.");
      return;
    }
    onChange([...blocks, makePersonalizationBlock(source, survey)]);
  }

  function removeBlock(blockId: string) {
    if (blocks.length <= 1) {
      onNotify("맞춤형 설문에는 맞춤정보 블록이 최소 1개 필요합니다.");
      return;
    }
    onChange(blocks.filter((block) => block.id !== blockId));
  }

  function toggleField(block: PersonalizationBlock, fieldIndex: number) {
    const nextFields = block.fields.map((field, index) =>
      index === fieldIndex ? { ...field, visible: !field.visible } : field
    );
    if (!nextFields.some((field) => field.visible)) {
      onNotify("블록마다 표시항목을 최소 1개 선택해 주세요.");
      return;
    }
    updateBlock(block.id, { fields: nextFields });
  }

  function updateFieldLabel(block: PersonalizationBlock, fieldIndex: number, label: string) {
    updateBlock(block.id, {
      fields: block.fields.map((field, index) => index === fieldIndex ? { ...field, label } : field)
    });
  }

  function moveField(block: PersonalizationBlock, fieldIndex: number, direction: -1 | 1) {
    const destination = fieldIndex + direction;
    if (destination < 0 || destination >= block.fields.length) return;
    const nextFields = [...block.fields];
    [nextFields[fieldIndex], nextFields[destination]] = [nextFields[destination], nextFields[fieldIndex]];
    updateBlock(block.id, { fields: nextFields });
  }

  function moveFieldToSource(block: PersonalizationBlock, fieldIndex: number, source: PersonalizationSource) {
    if (source === block.source) return;
    const field = block.fields[fieldIndex];
    const next = blocks.map((item) => item.id === block.id
      ? { ...item, fields: item.fields.filter((_, index) => index !== fieldIndex) }
      : item.source === source ? { ...item, fields: [...item.fields, field] } : item);
    onChange(next);
  }

  async function loadExcelSchema(file?: File) {
    if (!file) return;
    setLoadingSchema(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/targets/schema", {
        method: "POST",
        headers: { "x-admin-password": password },
        body: form
      });
      const result = await response.json() as LoadedSchema & {
        ok?: boolean;
        message?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.message || "엑셀 열을 읽지 못했습니다.");
      const existingHeaders = new Set(blocks.flatMap((block) => block.fields)
        .map((field) => field.sourceHeader ? normalizeHeader(field.sourceHeader) : "")
        .filter(Boolean));
      const required = new Set([result.suggested.contractId, result.suggested.projectId, result.suggested.companyName].filter(Boolean));
      const selected = new Set(result.columns
        .filter((column) => required.has(column.key) || existingHeaders.has(normalizeHeader(column.sourceHeader)))
        .map((column) => column.key));
      setPendingSchema({ sheetName: result.sheetName, headerRow: result.headerRow, columns: result.columns, suggested: result.suggested });
      setSelectedSchemaKeys(selected);
      onNotify(`${result.sheetName} 시트의 열 ${result.columns.length}개를 찾았습니다. 목록에 넣을 열을 선택해 주세요.`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "엑셀 열을 읽지 못했습니다.");
    } finally {
      setLoadingSchema(false);
    }
  }

  function applySelectedSchema() {
    const result = pendingSchema;
    if (!result) return;
    const requiredEntries = [
      [result.suggested.contractId, "계약ID"],
      [result.suggested.projectId, "과제번호"],
      [result.suggested.companyName, "기업명"]
    ] as const;
    const missingRequired = requiredEntries.filter(([key]) => !key || !selectedSchemaKeys.has(key)).map(([, label]) => label);
    if (missingRequired.length) {
      onNotify(`필수 열을 선택해 주세요: ${missingRequired.join(", ")}`);
      return;
    }
      const existing = new Map<string, { field: PersonalizationBlock["fields"][number]; source: PersonalizationSource }>();
      blocks.forEach((block) => block.fields.forEach((field) => {
        if (field.sourceHeader) existing.set(normalizeHeader(field.sourceHeader), { field, source: block.source });
      }));
      const bySource: Record<PersonalizationSource, PersonalizationBlock["fields"]> = { company: [], contract: [] };
      const resolvedKeys = new Map<string, string>();
      result.columns.filter((column) => selectedSchemaKeys.has(column.key)).forEach((column) => {
        const previous = existing.get(normalizeHeader(column.sourceHeader));
        const source = previous?.source || inferSource(column.sourceHeader);
        const nextField = previous ? {
          ...previous.field,
          sourceHeader: column.sourceHeader,
          missing: false
        } : {
          key: column.key,
          sourceHeader: column.sourceHeader,
          label: column.sourceHeader,
          visible: false
        };
        bySource[source].push(nextField);
        resolvedKeys.set(column.key, nextField.key);
      });
      const nextBlocks = SOURCES.map((source) => {
        const current = blocks.find((block) => block.source === source) || makePersonalizationBlock(source, survey);
        return { ...current, fields: bySource[source] };
      });
      onSchemaChange({
        sheetName: result.sheetName,
        headerRow: result.headerRow,
        keyColumns: Object.fromEntries(Object.entries(result.suggested).map(([name, key]) => [name, key ? resolvedKeys.get(key) || key : ""])) as PersonalizationExcelSchema["keyColumns"]
      }, nextBlocks);
      setPendingSchema(null);
      onNotify(`선택한 열 ${selectedSchemaKeys.size}개를 맞춤정보 목록에 연결했습니다.`);
  }

  function updateKeyColumn(name: keyof PersonalizationExcelSchema["keyColumns"], value: string) {
    const schema = survey.personalization?.excelSchema;
    if (!schema) return;
    onSchemaChange({ ...schema, keyColumns: { ...schema.keyColumns, [name]: value } }, blocks);
  }

  const dynamicFields = blocks.flatMap((block) => block.fields.filter((field) => field.sourceHeader));

  async function loadUploadedPreview() {
    setLoadingPreview(true);
    try {
      const response = await fetch(`/api/admin/targets/preview?surveyId=${encodeURIComponent(survey.id)}`, {
        headers: { "x-admin-password": password }
      });
      const result = await response.json() as { ok?: boolean; target?: SurveyTarget | null; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || "미리보기 자료를 불러오지 못했습니다.");
      if (!result.target) {
        setPreviewTarget(exampleTarget(survey.id));
        setPreviewStatus("등록된 조사대상이 없어 작성예시 데이터로 표시합니다.");
        return;
      }
      setPreviewTarget(result.target);
      setPreviewStatus(`${result.target.company.name || result.target.companyId} 조사대상 자료로 미리보기 중입니다.`);
    } catch (error) {
      setPreviewTarget(exampleTarget(survey.id));
      setPreviewStatus(error instanceof Error ? `${error.message} 작성예시 데이터로 표시합니다.` : "작성예시 데이터로 표시합니다.");
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <section className="personalization-editor">
      <div className="personalization-editor-head">
        <div>
          <h2>맞춤정보 표시 블록</h2>
          <p>조사대상 엑셀의 열을 설문에 표시하고, 기업의 확인·정정 응답을 받습니다.</p>
        </div>
        <div className="personalization-editor-actions">
          <label className="builder-btn secondary small personalization-file-button">
            {loadingSchema ? "열 읽는 중" : "엑셀 열 불러오기"}
            <input type="file" accept=".xlsx" disabled={loadingSchema} onChange={(event) => {
              void loadExcelSchema(event.target.files?.[0]);
              event.currentTarget.value = "";
            }} />
          </label>
          <button className="builder-btn secondary small" type="button" onClick={loadUploadedPreview} disabled={loadingPreview}>
            {loadingPreview ? "불러오는 중" : "업로드 자료로 미리보기"}
          </button>
          <button className="builder-btn primary small" type="button" onClick={addBlock} disabled={blocks.length >= SOURCES.length}>
            + 맞춤정보 블록 추가
          </button>
        </div>
      </div>

      {pendingSchema && (
        <div className="personalization-column-picker">
          <div className="personalization-column-picker-head">
            <div>
              <strong>목록에 불러올 엑셀 열 선택</strong>
              <span>{pendingSchema.sheetName} 시트 · 총 {pendingSchema.columns.length}개</span>
            </div>
            <div>
              <button className="builder-btn secondary small" type="button" onClick={() => {
                const required = new Set([pendingSchema.suggested.contractId, pendingSchema.suggested.projectId, pendingSchema.suggested.companyName].filter(Boolean));
                setSelectedSchemaKeys(required);
              }}>필수 열만</button>
              <button className="builder-btn secondary small" type="button" onClick={() => setSelectedSchemaKeys(new Set(pendingSchema.columns.map((column) => column.key)))}>전체 선택</button>
            </div>
          </div>
          <div className="personalization-column-picker-list">
            {pendingSchema.columns.map((column) => {
              const required = [pendingSchema.suggested.contractId, pendingSchema.suggested.projectId, pendingSchema.suggested.companyName].includes(column.key);
              return (
                <label key={column.key} className={required ? "is-required" : ""}>
                  <input
                    type="checkbox"
                    checked={selectedSchemaKeys.has(column.key)}
                    disabled={required}
                    onChange={(event) => setSelectedSchemaKeys((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(column.key); else next.delete(column.key);
                      return next;
                    })}
                  />
                  <span>{column.sourceHeader}</span>
                  {required && <em>필수</em>}
                </label>
              );
            })}
          </div>
          <div className="personalization-column-picker-actions">
            <span>{selectedSchemaKeys.size}개 선택</span>
            <button className="builder-btn secondary small" type="button" onClick={() => setPendingSchema(null)}>취소</button>
            <button className="builder-btn primary small" type="button" onClick={applySelectedSchema}>선택한 열 불러오기</button>
          </div>
        </div>
      )}

      {survey.personalization?.excelSchema && dynamicFields.length > 0 && (
        <div className="personalization-schema-card">
          <strong>식별 열 연결</strong>
          <span>{survey.personalization.excelSchema.sheetName} 시트 · {survey.personalization.excelSchema.headerRow}행이 열 이름</span>
          <div className="personalization-schema-grid">
            {([
              ["contractId", "계약ID (필수)"],
              ["projectId", "과제번호 (필수)"],
              ["companyName", "기업명 (필수)"],
              ["companyId", "기업ID (선택)"],
              ["targetStatus", "조사대상 여부 (선택)"],
              ["expiresAt", "링크 만료일 (선택)"]
            ] as const).map(([name, label]) => (
              <label key={name}>{label}
                <select value={survey.personalization!.excelSchema!.keyColumns[name] || ""} onChange={(event) => updateKeyColumn(name, event.target.value)}>
                  <option value="">연결 안 함</option>
                  {dynamicFields.map((field) => <option value={field.key} key={`${name}-${field.key}`}>{field.sourceHeader}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="personalization-block-list">
        {blocks.map((block) => {
          const section = survey.sections.find((item) => item.id === block.sectionId) || survey.sections[0];
          const questions = section?.questions || [];
          return (
            <article className="personalization-block-card" key={block.id}>
              <div className="personalization-block-head">
                <div>
                  <span className="personalization-source">{sourceLabel(block.source)}</span>
                  <strong>{block.title}</strong>
                </div>
                <button className="text-danger" type="button" onClick={() => removeBlock(block.id)}>블록 삭제</button>
              </div>

              <div className="personalization-block-grid">
                <label className="builder-col-span">
                  화면에 표시할 제목
                  <input value={block.title} onChange={(event) => updateBlock(block.id, { title: event.target.value })} />
                </label>
                <label>
                  표시할 섹션
                  <select
                    value={section?.id || ""}
                    onChange={(event) => {
                      const nextSection = survey.sections.find((item) => item.id === event.target.value);
                      const firstQuestion = nextSection?.questions[0];
                      updateBlock(block.id, {
                        sectionId: event.target.value,
                        position: block.position === "after_question" && !firstQuestion ? "after_last" : block.position,
                        afterQuestionId: block.position === "after_question" ? firstQuestion?.id : undefined
                      });
                    }}
                  >
                    {survey.sections.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <label>
                  섹션 안 표시 위치
                  <select
                    value={block.position}
                    onChange={(event) => {
                      const position = event.target.value as PersonalizationBlock["position"];
                      updateBlock(block.id, {
                        position,
                        afterQuestionId: position === "after_question" ? block.afterQuestionId || questions[0]?.id : undefined
                      });
                    }}
                  >
                    <option value="before_first">첫 문항 앞</option>
                    <option value="after_question" disabled={questions.length === 0}>특정 문항 뒤</option>
                    <option value="after_last">마지막 문항 뒤</option>
                  </select>
                </label>
                {block.position === "after_question" && (
                  <label className="builder-col-span">
                    기준 문항
                    <select
                      value={block.afterQuestionId || ""}
                      onChange={(event) => updateBlock(block.id, { afterQuestionId: event.target.value })}
                    >
                      {questions.map((question) => (
                        <option value={question.id} key={question.id}>{question.id} · {question.title}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="personalization-field-head">
                <strong>표시항목·순서·화면 명칭</strong>
                <span>엑셀 열과 연결된 항목만 선택할 수 있습니다.</span>
              </div>
              {block.source === "contract" && (
                <div className="personalization-match-editor">
                  <label>
                    일치 여부 선택지 <span>한 줄에 하나씩 입력</span>
                    <textarea
                      value={contractMatchOptions(block).join("\n")}
                      onChange={(event) => updateBlock(block.id, {
                        matchOptions: event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
                      })}
                    />
                  </label>
                  <label>
                    정정 입력란 안내 문구
                    <input
                      value={block.correctionPrompt || "다른 정보가 있는 경우 정확한 내용을 입력해 주세요."}
                      onChange={(event) => updateBlock(block.id, { correctionPrompt: event.target.value })}
                    />
                  </label>
                </div>
              )}
              <div className="personalization-field-list">
                {block.fields.map((field, index) => {
                  const definition = fieldCatalog(block.source).find((item) => item.key === field.key);
                  const sourceHeader = field.sourceHeader || definition?.header;
                  if (!sourceHeader) return null;
                  return (
                    <div className={`personalization-field-row ${field.visible ? "is-visible" : ""}`} key={field.key}>
                      <label className="personalization-field-check">
                        <input type="checkbox" checked={field.visible} onChange={() => toggleField(block, index)} />
                        표시
                      </label>
                      <span className="personalization-field-source">엑셀 열: {sourceHeader}</span>
                      <input
                        aria-label={`${sourceHeader} 화면 명칭`}
                        value={field.label}
                        onChange={(event) => updateFieldLabel(block, index, event.target.value)}
                      />
                      {field.sourceHeader && (
                        <select aria-label={`${sourceHeader} 표시 블록`} value={block.source} onChange={(event) => moveFieldToSource(block, index, event.target.value as PersonalizationSource)}>
                          <option value="company">기업정보 블록</option>
                          <option value="contract">계약정보 블록</option>
                        </select>
                      )}
                      <div className="personalization-order-actions">
                        <button type="button" onClick={() => moveField(block, index, -1)} disabled={index === 0} aria-label="위로 이동">↑</button>
                        <button type="button" onClick={() => moveField(block, index, 1)} disabled={index === block.fields.length - 1} aria-label="아래로 이동">↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      <div className="personalization-preview">
        <div className="personalization-preview-head">
          <strong>응답 화면 미리보기</strong>
          <span>{previewStatus}</span>
        </div>
        {blocks.map((block) => <BlockPreview block={block} target={previewTarget} key={block.id} />)}
      </div>
    </section>
  );
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, "").replace(/[·ㆍ]/g, "").trim().toLowerCase();
}

function inferSource(header: string): PersonalizationSource {
  return /(기업명|기술실시기업|사업자|대표자|소재지|기업규모|업종|기업id)/i.test(header) ? "company" : "contract";
}

function BlockPreview({ block, target }: { block: PersonalizationBlock; target: SurveyTarget }) {
  const fields = visibleBlockFields(block);
  return (
    <div className="personalization-preview-block">
      <strong>{block.title}</strong>
      <table>
        <thead>
          <tr>
            <th>항목</th>
            <th>KEITI 보유 정보</th>
            {block.source === "company" && <th>정정 사항</th>}
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.key}>
              <th>{field.label}</th>
              <td>{formatTargetFieldValue(targetFieldValue(target, block.source, field.key, field.header), field.key)}</td>
              {block.source === "company" && <td className="preview-empty">다른 경우 입력</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {block.source === "contract" && (
        <div className="personalization-preview-options">{contractMatchOptions(block).join(" · ")}</div>
      )}
    </div>
  );
}

function exampleTarget(surveyId: string): SurveyTarget {
  return {
    targetId: "preview-target",
    surveyId,
    companyId: "COMP-001",
    projectId: "PRJ-001",
    contractId: "CONT-001",
    company: {
      name: "예시기업",
      businessNumber: "123-45-67890",
      representative: "홍길동",
      region: "서울",
      size: "중소",
      industry: "환경서비스업"
    },
    contract: {
      projectName: "환경기술 연구개발 예시과제",
      transferInstitution: "예시연구원",
      contractName: "환경기술 실시계약",
      signedAt: "2026-01-15",
      periodStart: "2026-01-15",
      periodEnd: "2030-12-31",
      amount: 10000000
    },
    active: true
  };
}
