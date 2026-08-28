/**
 * messages.ko.ts — the Korean catalogue, and the source of truth for keys.
 *
 * Every other locale is typed against this object, so a key added here that is
 * not translated elsewhere fails the build rather than rendering blank.
 *
 * The printed marks stay untranslated in other locales. `필수` and `선택` are
 * the words printed on the page the user is looking at; replacing them with
 * "required" and "optional" would leave the reader unable to find what we are
 * pointing at.
 */

export const ko = {
  // Why an item was turned off, shown under its label.
  'reason.optional_mark': '선택 항목',
  'reason.no_mark': '필수·선택 표기 없음',
  'reason.substance_contradicts_label': '필수 표기이나 내용은 마케팅·제3자 제공',
  'reason.selectall_inconsistent': '개별 항목과 불일치',
  'reason.quote_not_verbatim': '약관에서 근거 문장을 찾지 못함',
  'reason.terms_unavailable': '약관 본문을 읽지 못함',
  'reason.substance_unclear': '내용 판단 불가',
  'reason.substance_unknown': '내용 판단 불가',
  'reason.quote_missing': '내용 판단 불가',
  'reason.disabled': '사이트가 변경을 막아둠',

  // Findings about the page itself, independent of what we did.
  //
  // They cite no statute, and that is deliberate. Which law governs a consent
  // item depends on what the item is: personal-data consent falls under the
  // Personal Information Protection Act, marketing consent under the Network
  // Act, and consent to terms of service under contract law and no privacy
  // statute at all. Three quarters of the golden set is not personal-data
  // consent. The extension reads a printed mark; it does not determine which
  // statute applies, so it says what it saw and stops.
  'flag.missing_mark': '필수·선택 표기 없음',
  'flag.prechecked_optional': '선택 항목이 미리 체크되어 있었음',
  'flag.label_substance_mismatch': '표기와 내용 불일치',
  'flag.selectall_violation': 'KRDS 일괄 동의 규칙 위반',

  // Under `intl` there is no printed mark to be missing, so the vocabulary
  // shifts from "the marking is wrong" to "consent was not freely given".
  'reason.intl.no_mark': '필수임이 증명되지 않음',
  'flag.intl.prechecked_optional': '사용자가 오기 전에 이미 체크되어 있었음',
  'flag.intl.selectall_violation': '일괄 동의가 개별 선택을 가림',

  'moment.signup': '회원가입',
  'moment.payment': '결제',
  'moment.entry': '이벤트 응모',
  'moment.reconsent': '약관 재동의',
  'moment.link': '계정 연동',
  'moment.verify': '본인확인',
  'moment.other': '동의',

  'badge.headline.pending': '선택 항목 {count}개를 끌 수 있습니다',
  'badge.headline.done': '선택 항목 {count}개를 껐습니다',
  'badge.headline.findings': '표기 문제 {count}건',
  'badge.headline.refused': '동의 요청을 거부했습니다',
  'badge.headline.banner': '동의를 요구하는 배너가 있습니다',
  'badge.banner.refused': '배너에서 「{label}」을(를) 눌렀습니다.',
  'badge.banner.found': '거부 버튼을 확실히 찾지 못해 그대로 두었습니다. 직접 확인해 주세요.',
  'badge.section.pending': '끌 수 있는 항목',
  'badge.section.done': '꺼진 항목',
  'badge.section.findings': '표기 문제',
  'badge.unnamedItem': '(이름 없는 항목)',
  'badge.degraded': 'API 키가 없어 표기 기준으로만 판단했습니다.',
  'badge.manualOnly': '{moment} 화면에서는 자동으로 바꾸지 않습니다.',
  'badge.apply': '지금 끄기',
  'badge.regime.kr': '한국 법 기준',
  'badge.regime.intl': '국제 기준',
  'badge.regime.switchTo': '{regime}으로 보기',
  'badge.reportOnly.intl':
    '한국 밖에서는 필수 표기가 인쇄되지 않으므로 자동으로 바꾸지 않습니다. 확인 후 눌러주세요.',

  // The right-click menu. Its root label is the only place that can report
  // "this page has no consent items", which is the answer the badge cannot give.
  'menu.root': 'Agreedee',
  'menu.root.none': 'Agreedee — 이 페이지에는 동의 항목이 없습니다',
  'menu.root.done': 'Agreedee — 동의 항목 {items}개 중 {count}개를 껐습니다',
  'menu.root.pending': 'Agreedee — 동의 항목 {items}개, {count}개 끌 수 있음',
  'menu.rescan': '이 페이지 다시 검사',
  // The menu has room the badge does not, so it names the law rather than
  // citing a section number nobody can place.
  'menu.regime.header': '이 페이지를 무엇으로 판단할지',
  'menu.regime.kr': '한국 · 인쇄된 필수/선택 표기',
  'menu.regime.intl': '그 외 · 약관 내용 (GDPR 기준)',
  'menu.options': '설정 열기',

  'options.title': 'Agreedee 설정',
  'options.tagline': '쿠키 배너와 동의 폼에서 선택 동의를 거부합니다. 제출 버튼은 절대 누르지 않습니다.',
  'options.provider': 'AI 판단 엔진',
  'options.provider.anthropic': 'Anthropic (Claude)',
  'options.provider.anthropic.why': '정확도 높음 · API 키 필요 · 약관 문구가 외부로 전송됨',
  'options.provider.openai': 'OpenAI 호환',
  'options.provider.openai.why': 'OpenAI · LM Studio · vLLM · OpenRouter 등 · 주소만 바꾸면 됨',
  'options.openai.url': '서버 주소',
  'options.openai.urlHint':
    'OpenAI 스펙을 따르는 서버면 무엇이든 됩니다. LM Studio는 http://localhost:1234/v1, ' +
    'vLLM은 http://localhost:8000/v1. 버전 경로(/v1)까지 포함해서 적어주세요.',
  'options.openai.key': 'API 키 (내 컴퓨터의 서버라면 비워두세요)',
  'options.openai.model': '모델',
  'options.openai.modelHint':
    '연결 테스트를 누르면 서버가 제공하는 모델 목록을 불러옵니다. 구조화된 출력을 지원하지 않는 ' +
    '서버면 자동으로 JSON 모드로 한 번 더 시도합니다.',
  'options.openai.note.title': '주소에 따라 전송 범위가 달라집니다',
  'options.openai.note.body':
    '적어주신 서버로 라벨 문구와 약관 본문이 전송됩니다. localhost를 가리키면 아무것도 이 컴퓨터를 ' +
    '벗어나지 않고, 외부 서비스를 가리키면 그 서비스로 전송됩니다. 기본값(api.openai.com) 외의 ' +
    '주소를 쓰면 저장할 때 Chrome이 해당 도메인 접근 권한을 물어봅니다.',
  'options.hostDenied': '그 주소에 대한 접근 권한이 없어 저장하지 않았습니다',
  'options.provider.ollama': 'Ollama (내 컴퓨터)',
  'options.provider.ollama.why': '키 불필요 · 아무것도 외부로 나가지 않음 · 정확도는 모델에 따라',
  'options.ollama.url': 'Ollama 주소',
  'options.ollama.model': '모델',
  'options.ollama.modelHint':
    '연결 테스트를 누르면 설치된 모델 목록을 불러옵니다. 구조화된 출력(JSON 스키마)을 지원하는 모델이어야 합니다.',
  'options.ollama.privacy.title': '아무것도 외부로 나가지 않습니다',
  'options.ollama.privacy.body':
    'Ollama를 쓰면 라벨 문구와 약관 본문이 이 컴퓨터의 Ollama 서버로만 전송됩니다. 계정도, 키도, ' +
    '외부 네트워크 요청도 없습니다. 다만 로컬 모델은 Claude보다 판단이 약합니다 — 근거 문장을 ' +
    '약관에서 그대로 찾지 못한 답은 버려지고 해당 항목은 해제되므로, 안전이 아니라 적중률만 떨어집니다.',
  'options.probe': '연결 테스트',
  'options.probe.running': '확인 중…',
  'options.probe.ok': '연결됨',
  'options.probe.unreachable': '서버에 연결하지 못했습니다',
  'options.probe.unauthorized': 'API 키가 올바르지 않습니다',
  'options.probe.modelMissing': '그 모델을 찾을 수 없습니다',
  'options.probe.failed': '확인에 실패했습니다',
  'options.apiKey': 'Anthropic API 키',
  'options.model': '모델',
  'options.modelDefaultSuffix': '(기본)',
  'options.language': '표시 언어',
  'options.language.auto': '브라우저 설정 따르기',
  'options.enabled': '사용함',
  'options.save': '저장',
  'options.saved': '저장했습니다',
  'options.noKey.title': '키가 없어도 동작합니다',
  'options.noKey.body':
    '키를 넣지 않으면 페이지에 인쇄된 필수/선택 표기와 KRDS 일괄 동의 규칙만으로 판단합니다. ' +
    '이 모드에서는 어떤 내용도 외부로 전송되지 않습니다.',
  'options.whatIsSent.title': '키를 넣으면 무엇이 전송되나요',
  'options.whatIsSent.body':
    '동의 항목의 라벨 문구와 약관 본문이 사용자의 키로 Anthropic API에 전송되어, 표기와 실제 ' +
    '내용이 일치하는지 확인합니다. 페이지 전체나 입력한 개인정보는 전송하지 않습니다. 키는 이 ' +
    '브라우저의 chrome.storage.local에만 저장되며 확장에 포함되어 배포되지 않습니다.',
} as const;
