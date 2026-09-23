sub init()
  m.focusBorder = m.top.findNode("focusBorder")
  m.surface = m.top.findNode("surface")
  m.accent = m.top.findNode("accent")
  m.author = m.top.findNode("author")
  m.badge = m.top.findNode("badge")
  m.message = m.top.findNode("message")
  m.avatar = m.top.findNode("avatar")
  m.avatarFallback = m.top.findNode("avatarFallback")
  m.avatarInitials = m.top.findNode("avatarInitials")
end sub

sub onContentChanged()
  content = m.top.itemContent
  if content = invalid then return
  m.author.text = content.shortDescriptionLine1
  m.message.text = content.title
  m.badge.text = content.shortDescriptionLine2
  authorName = content.shortDescriptionLine1
  initial = "?"
  if authorName <> invalid and authorName <> "" then initial = UCase(Left(authorName, 1))
  m.avatarInitials.text = initial
  avatarUrl = ""
  if content.HasField("avatarUrl") and content.avatarUrl <> invalid then avatarUrl = content.avatarUrl
  m.avatar.visible = avatarUrl <> ""
  m.avatarFallback.visible = avatarUrl = ""
  m.avatarInitials.visible = avatarUrl = ""
  if avatarUrl <> "" then m.avatar.uri = avatarUrl
  if content.shortDescriptionLine2 = "PINNED" or content.shortDescriptionLine2 = "HOST"
    m.accent.color = "#ff4d4f"
    m.badge.color = "#ff6b6d"
  else
    m.accent.color = "#52525b"
    m.badge.color = "#d4d4d8"
  end if
end sub

sub onFocusChanged()
  focused = m.top.focusPercent > 0.5
  m.focusBorder.visible = focused
  if focused
    m.surface.color = "#27272f"
  else
    m.surface.color = "#1c1c24"
  end if
end sub
