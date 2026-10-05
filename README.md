# kupi

건국대학교 AI Gateway(aichat.konkuk.ac.kr)를 [pi coding agent](https://pi.dev)에 연결하는 패키지.

- `/sync-models`: 게이트웨이의 현재 모델 목록으로 `~/.pi/agent/models.json` 생성
- 하단 HUD: 컨텍스트 사용량과 월 크레딧 사용량 표시
- `/credits`: 크레딧 즉시 갱신

## 1. API 키 발급

[aichat.konkuk.ac.kr](https://aichat.konkuk.ac.kr) 에서 API 키를 발급받아요.

## 2. 환경변수 설정

pi 와 kupi 는 `KONKUK_AI_API_KEY` 라는 이름의 환경변수에서 키를 읽어요. 아래 세 가지 중 하나로 등록하세요.

### 방법 A. 셸 설정 파일에 직접 넣기 (가장 간단)

macOS 기본 셸은 zsh 라서 `~/.zshrc` 에 넣으면 돼요. 어떤 셸인지 모르겠다면 `echo $SHELL` 로 확인하세요.

| 셸 | 파일 |
|---|---|
| zsh (macOS 기본) | `~/.zshrc` |
| bash | `~/.bashrc` (macOS 에서는 `~/.bash_profile`) |
| fish | `~/.config/fish/config.fish` (`set -Ux KONKUK_AI_API_KEY 발급받은_키`) |

zsh 기준:

```sh
echo 'export KONKUK_AI_API_KEY="발급받은_키"' >> ~/.zshrc
source ~/.zshrc
```

터미널을 새로 열거나 `source` 를 해야 반영돼요. 확인:

```sh
echo ${KONKUK_AI_API_KEY:0:6}   # 앞 6글자만 출력되면 정상
```

주의: `.zshrc` 를 dotfiles 레포로 관리하거나 GitHub 에 올린다면 키가 같이 올라가요. 그럴 땐 방법 B 나 C 를 쓰세요.

### 방법 B. 키를 별도 파일로 분리

키만 담은 파일을 만들고 `.zshrc` 에서 불러와요. dotfiles 를 공개해도 키는 안 올라가요.

```sh
echo 'export KONKUK_AI_API_KEY="발급받은_키"' > ~/.kupi-env
chmod 600 ~/.kupi-env          # 나만 읽을 수 있게
echo '[ -f ~/.kupi-env ] && source ~/.kupi-env' >> ~/.zshrc
source ~/.zshrc
```

### 방법 C. macOS 키체인 (키를 평문 파일에 두기 싫을 때)

```sh
# 한 번만: 키체인에 저장
security add-generic-password -a "$USER" -s kupi -w "발급받은_키"

# ~/.zshrc 에 추가: 셸이 열릴 때 키체인에서 읽어옴
echo 'export KONKUK_AI_API_KEY="$(security find-generic-password -a "$USER" -s kupi -w)"' >> ~/.zshrc
source ~/.zshrc
```

키를 바꿀 땐 `security add-generic-password -U -a "$USER" -s kupi -w "새_키"` 를 쓰세요.
셸을 열 때마다 키체인 조회가 한 번 일어나요.

### 방법 D. 한 번만 쓰기

등록 없이 현재 터미널에서만 쓸 때:

```sh
export KONKUK_AI_API_KEY="발급받은_키"
pi
```

터미널을 닫으면 사라져요.

### 환경변수가 안 먹힐 때

- 키를 넣은 터미널과 pi 를 실행한 터미널이 같은지 확인하세요. `source ~/.zshrc` 를 안 했거나 새 터미널을 안 열었으면 변수가 없어요.
- IDE 터미널이나 GUI 앱에서 pi 를 띄우면 `~/.zshrc` 가 안 읽힐 수 있어요. 그럴 땐 `~/.zshenv` 에 넣거나 터미널에서 직접 실행하세요.
- 따옴표 안에 줄바꿈이나 공백이 섞이지 않았는지 확인하세요.

## 3. 설치

```sh
pi install git:github.com/sterdsterd/kupi
```

## 4. 사용

pi 를 열고:

1. `/sync-models` 로 모델 목록 생성
2. `/model` 로 모델 선택

모델이 새로 추가되거나 바뀌면 `/sync-models` 를 다시 실행하세요. 기존 파일은 `models.json.bak` 으로 남아요.

## 크레딧 단위

모델별 단가는 [docs](https://docs.mindlogic.ai/docs/kkus-ac/baze/product/model-credits) 에서 확인할 수 있어요.
