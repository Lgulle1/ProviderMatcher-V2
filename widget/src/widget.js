;(function () {
  'use strict'

  var supabaseBaseUrl =
    typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : ''

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      var v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  function fisherYatesShuffle(arr) {
    var a = arr.slice()
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1))
      var tmp = a[i]
      a[i] = a[j]
      a[j] = tmp
    }
    return a
  }

  /** Matches LogicTester: range needs min and/or max column populated to count as “has data”. */
  function hasConstraintDataForSkip(offerings, c) {
    if (c.type === 'range') {
      var minK = c.mapped_key
      var maxK = c.secondary_mapped_key
      return offerings.some(function (o) {
        var cons = o.constraints || {}
        var a = cons[minK]
        var b = maxK ? cons[maxK] : undefined
        var hasA = a !== null && a !== undefined && a !== ''
        var hasB = maxK ? b !== null && b !== undefined && b !== '' : false
        return hasA || hasB
      })
    }
    var k = c.mapped_key
    return offerings.some(function (o) {
      var cons = o.constraints || {}
      var v = cons[k]
      return v !== null && v !== undefined && v !== ''
    })
  }

  /** Identical to LogicTester filterBinary */
  function filterBinary(offerings, c, pickedYes) {
    var targetMode = pickedYes ? c.yes_maps_to : c.no_maps_to
    if (targetMode === 'both') {
      return offerings
    }
    return offerings.filter(function (o) {
      var cons = o.constraints || {}
      var v = cons[c.mapped_key]
      if (targetMode === '1') {
        return v === 1 || v === '1' || v === true
      }
      return v === undefined || v === null || v === 0 || v === '0' || v === false
    })
  }

  /** Identical to LogicTester filterRange */
  function filterRange(offerings, c, answer) {
    var minKey = c.mapped_key
    var maxKey = c.secondary_mapped_key || ''
    return offerings.filter(function (o) {
      var cons = o.constraints || {}
      var min = Number(cons[minKey] ?? 0)
      var max = maxKey ? Number(cons[maxKey] ?? 999) : 999
      return min <= answer && answer <= max
    })
  }

  /** Identical to LogicTester filterExact */
  function filterExact(offerings, c, answer) {
    var key = c.mapped_key
    var t = String(answer).trim().toLowerCase()
    return offerings.filter(function (o) {
      var cons = o.constraints || {}
      var v = cons[key]
      return String(v ?? '').toLowerCase() === t
    })
  }

  function getUniqueConstraintValues(offerings, mappedKey) {
    var set = {}
    var out = []
    for (var i = 0; i < offerings.length; i++) {
      var o = offerings[i]
      var cons = o.constraints || {}
      var v = cons[mappedKey]
      if (v !== null && v !== undefined && v !== '') {
        var s = String(v)
        if (!set[s]) {
          set[s] = true
          out.push(s)
        }
      }
    }
    out.sort(function (a, b) {
      return a.localeCompare(b)
    })
    return out
  }

  var widget = {
    widgetId: null,
    data: null,
    shadow: null,
    state: {
      phase: 'questions',
      currentQuestionIndex: 0,
      answers: {},
      activeOfferings: [],
      selectedCaseTypeId: null,
      selectedLocationId: null,
      bypassMode: false,
      bypassResumeIndex: null,
      offeringsBeforeBypass: null,
      history: [],
      sessionId: generateUUID(),
    },

    init: function () {
      var scripts = document.querySelectorAll('script[data-widget-id]')
      var script = scripts[scripts.length - 1]
      if (!script) {
        console.warn('ProviderMatcher: No script tag with data-widget-id found')
        return
      }
      this.widgetId = script.getAttribute('data-widget-id')
      if (!this.widgetId) {
        console.warn('ProviderMatcher: Missing data-widget-id')
        return
      }
      var self = this
      this.fetchData().then(function () {
        if (self.data) {
          self.checkDomain()
          if (self.data) {
            self.state.activeOfferings = self.data.offerings || []
            self.injectWidget()
          }
        }
      })
    },

    fetchData: async function () {
      try {
        var response = await fetch(
          supabaseBaseUrl + '/functions/v1/widget-data?id=' + this.widgetId,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        )
        if (!response.ok) throw new Error('HTTP ' + response.status)
        this.data = await response.json()
      } catch (e) {
        console.warn('ProviderMatcher: Failed to load widget data', e)
        this.data = null
      }
    },

    checkDomain: function () {
      var domains = (this.data && this.data.config && this.data.config.allowed_domains) || []
      if (!domains.length) return
      var host = window.location.hostname
      var allowed = domains.some(function (d) {
        return host === d || host.endsWith('.' + d)
      })
      if (!allowed) {
        console.warn('ProviderMatcher: Domain not authorized')
        this.data = null
      }
    },

    injectWidget: function () {
      var config = this.data.config || {}
      var host = document.createElement('div')
      host.setAttribute('id', 'pm-widget-host')
      if (config.embed_mode === 'inline') {
        host.style.cssText = 'position:relative;width:100%;z-index:1;'
      } else {
        host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;'
      }
      this.shadow = host.attachShadow({ mode: 'open' })
      this.injectStyles()
      if (config.embed_mode === 'inline') {
        this.createChatContainer()
        this.startFlow()
      } else {
        this.createFloatingButton()
      }
      document.body.appendChild(host)
    },

    injectStyles: function () {
      var primaryColor = (this.data.config && this.data.config.primary_color) || '#3B82F6'
      var style = document.createElement('style')
      style.textContent = [
        '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}',
        '.pm-btn{background:' +
          primaryColor +
          ';color:white;border:none;border-radius:50px;padding:14px 24px;font-size:15px;font-weight:600;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.2);}',
        '.pm-chat{width:380px;max-height:85vh;background:white;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.15);display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;}',
        '.pm-header{background:' +
          primaryColor +
          ';color:white;padding:16px;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:15px;}',
        '.pm-close{background:none;border:none;color:white;font-size:22px;cursor:pointer;line-height:1;padding:0;font-family:inherit;}',
        '.pm-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;display:flex;flex-direction:column;gap:10px;}',
        '.pm-bubble{background:#f1f5f9;border-radius:12px 12px 12px 4px;padding:12px 16px;font-size:14px;line-height:1.5;color:#1e293b;max-width:85%;}',
        '.pm-user-bubble{background:' +
          primaryColor +
          ';color:white;border-radius:12px 12px 4px 12px;padding:10px 14px;font-size:14px;align-self:flex-end;max-width:75%;}',
        '.pm-subtext{font-size:12px;color:#64748b;}',
        '.pm-options{display:flex;flex-direction:column;gap:8px;}',
        '.pm-option{background:white;border:2px solid ' +
          primaryColor +
          ';color:' +
          primaryColor +
          ';border-radius:10px;padding:11px 16px;font-size:14px;font-weight:500;cursor:pointer;text-align:left;font-family:inherit;}',
        '.pm-option:hover{background:' + primaryColor + ';color:white;}',
        '.pm-number-wrap{display:flex;gap:8px;}',
        '.pm-number-input{flex:1;padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:16px;font-family:inherit;}',
        '.pm-number-input:focus{outline:none;border-color:' + primaryColor + ';}',
        '.pm-next-btn{background:' +
          primaryColor +
          ';color:white;border:none;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;}',
        '.pm-back-btn{background:none;border:none;color:#64748b;font-size:13px;cursor:pointer;padding:0;font-family:inherit;text-decoration:underline;align-self:flex-start;}',
        '.pm-select{width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:16px;font-family:inherit;background:white;}',
        '.pm-select:focus{outline:none;border-color:' + primaryColor + ';}',
        '.pm-results{display:flex;flex-direction:column;gap:6px;}',
        '.pm-section-title{font-weight:700;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:10px 0 4px;}',
        '.pm-cat-title{font-weight:600;font-size:14px;color:#1e293b;padding:4px 0 2px;}',
        '.pm-card{display:flex;flex-direction:column;background:#f8fafc;border-radius:12px;padding:12px;gap:0;}',
        '.pm-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:white;}',
        '.pm-info{flex:1;min-width:0;}',
        '.pm-name{font-weight:600;font-size:14px;color:#1e293b;}',
        '.pm-sub{font-size:12px;color:#64748b;}',
        '.pm-locs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
        '.pm-book{background:' + primaryColor + ';color:white;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:block;width:100%;box-sizing:border-box;text-align:center;font-family:inherit;}',
        '.pm-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}',
        '.pm-cat-pill{background:#eff6ff;color:#1d4ed8;font-size:11px;padding:3px 10px;border-radius:999px;}',
        '.pm-loc-pill{background:#f1f5f9;color:#64748b;font-size:11px;padding:2px 8px;border-radius:999px;border:0.5px solid #e2e8f0;white-space:nowrap;}',
        '.pm-view-profile{font-size:11px;color:#64748b;text-decoration:none;margin-top:6px;display:inline-block;}',
        '.pm-actions{display:flex;flex-direction:column;gap:6px;flex-shrink:0;width:160px;}',
        '.pm-call{background:transparent;color:' + primaryColor + ';border:2px solid ' + primaryColor + ';border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:block;width:100%;box-sizing:border-box;text-align:center;font-family:inherit;}',
        '.pm-slide-panel{display:flex;flex-direction:column;gap:6px;width:160px;}',
        '.pm-slide-label{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;text-align:center;margin-bottom:2px;}',
        '.pm-back-link{background:transparent;color:#94a3b8;border:none;font-size:10px;cursor:pointer;padding:3px 0;text-align:center;width:100%;font-family:inherit;}',
        '.pm-search{width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;font-family:inherit;margin-bottom:8px;}',
        '.pm-search:focus{outline:none;border-color:' + primaryColor + ';}',
        '.pm-help{font-size:12px;color:' +
          primaryColor +
          ';cursor:pointer;text-decoration:underline;text-align:center;padding:4px;}',
        '.pm-fallback{text-align:center;padding:16px;}',
        '.pm-fb-msg{font-size:14px;color:#475569;margin-bottom:12px;line-height:1.5;}',
        '.pm-fb-phone{font-weight:700;font-size:16px;color:#1e293b;margin-bottom:16px;}',
        '.pm-restart{background:none;border:2px solid ' +
          primaryColor +
          ';color:' +
          primaryColor +
          ';border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;}',
        '.pm-disclaimer{font-size:11px;color:#94a3b8;text-align:center;padding:8px;border-top:1px solid #f1f5f9;margin-top:8px;}',
        '.pm-field-col{display:flex;flex-direction:column;gap:8px;}',
        '@media(max-width:480px){.pm-chat{width:100vw;height:100vh;max-height:100vh;border-radius:0;position:fixed;top:0;left:0;}}',
      ].join('')
      this.shadow.appendChild(style)
    },

    createFloatingButton: function () {
      var self = this
      var btn = document.createElement('button')
      btn.className = 'pm-btn'
      btn.textContent = (this.data.config && this.data.config.button_text) || 'Find a Provider'
      btn.onclick = function () {
        btn.remove()
        self.createChatContainer()
        self.startFlow()
      }
      this.shadow.appendChild(btn)
    },

    createChatContainer: function () {
      var self = this
      var config = this.data.config || {}
      var chat = document.createElement('div')
      chat.className = 'pm-chat'
      chat.id = 'pm-chat'
      var header = document.createElement('div')
      header.className = 'pm-header'
      var title = document.createElement('span')
      title.textContent = config.greeting_text || 'Find a Provider'
      header.appendChild(title)
      if (config.embed_mode !== 'inline') {
        var closeBtn = document.createElement('button')
        closeBtn.className = 'pm-close'
        closeBtn.innerHTML = '&times;'
        closeBtn.onclick = function () {
          chat.remove()
          self.resetState()
          document.body.style.overflow = '';
          self.shadow.host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;';
          self.createFloatingButton()
        }
        header.appendChild(closeBtn)
      }
      var body = document.createElement('div')
      body.className = 'pm-body'
      body.id = 'pm-body'
      chat.appendChild(header)
      chat.appendChild(body)
      this.shadow.appendChild(chat)
      document.body.style.overflow = 'hidden';
      var self = this;
      var mq = window.matchMedia('(max-width:480px)');
      function applyHostLayout() {
        if (mq.matches) {
          self.shadow.host.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;';
        } else {
          self.shadow.host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;';
        }
      }
      applyHostLayout();
      mq.addEventListener('change', applyHostLayout);
    },

    resetState: function () {
      this.state = {
        phase: 'questions',
        currentQuestionIndex: 0,
        answers: {},
        activeOfferings: this.data ? this.data.offerings || [] : [],
        selectedCaseTypeId: null,
        selectedLocationId: null,
        bypassMode: false,
        bypassResumeIndex: null,
        offeringsBeforeBypass: null,
        history: [],
        sessionId: generateUUID(),
      }
    },

    addBubble: function (text, isUser) {
      var body = this.shadow.getElementById('pm-body')
      if (!body) return
      var bubble = document.createElement('div')
      bubble.className = isUser ? 'pm-user-bubble' : 'pm-bubble'
      bubble.textContent = text
      body.appendChild(bubble)
      body.scrollTop = body.scrollHeight
    },

    startFlow: function () {
      var body = this.shadow.getElementById('pm-body')
      if (body) body.innerHTML = ''
      this.state.phase = 'questions'
      this.state.currentQuestionIndex = 0
      this.state.bypassMode = false
      this.state.bypassResumeIndex = null
      this.state.offeringsBeforeBypass = null
      this.renderQuestion()
    },

    getQuestionSequence: function () {
      var all = this.data.questions || []
      if (!all.length) return []
      var entries = all.filter(function (q) {
        return q.question_type === 'entry'
      })
      var sortedEntries = entries.slice().sort(function (a, b) {
        return a.order_rank - b.order_rank
      })
      var entry = sortedEntries[0]
      var nonEntry = all
        .filter(function (q) {
          return q.question_type !== 'entry'
        })
        .sort(function (a, b) {
          return a.order_rank - b.order_rank
        })
      return entry ? [entry].concat(nonEntry) : nonEntry
    },

    findConstraint: function (id) {
      return (
        (this.data.constraints || []).find(function (c) {
          return c.id === id
        }) || null
      )
    },

    renderQuestion: function () {
      var questions = this.getQuestionSequence()
      var index = this.state.currentQuestionIndex
      if (index >= questions.length) {
        this.showResults()
        return
      }
      var q = questions[index]
      if (q.question_type === 'clinical' && q.constraint_id) {
        var constraint = this.findConstraint(q.constraint_id)
        if (constraint) {
          var hasData = hasConstraintDataForSkip(this.state.activeOfferings, constraint)
          if (!hasData) {
            this.state.currentQuestionIndex++
            this.renderQuestion()
            return
          }
        }
      }
      var body = this.shadow.getElementById('pm-body')
      if (!body) return
      if (this.state.history.length > 0) {
        var self = this
        var backBtn = document.createElement('button')
        backBtn.className = 'pm-back-btn'
        backBtn.textContent = '← Back'
        backBtn.onclick = function () {
          self.goBack()
        }
        body.appendChild(backBtn)
      }
      this.addBubble(q.question_text, false)
      if (q.subtext) {
        var sub = document.createElement('div')
        sub.className = 'pm-subtext'
        sub.textContent = q.subtext
        body.appendChild(sub)
        body.scrollTop = body.scrollHeight
      }
      if (q.question_type === 'entry') {
        this.renderCaseTypes(q)
        body.scrollTop = 0
      } else if (q.question_type === 'location') this.renderLocationSelect(q)
      else if (q.question_type === 'provider') this.renderProviderChoice(q)
      else if (q.question_type === 'clinical') {
        var c = this.findConstraint(q.constraint_id)
        if (!c) {
          this.state.currentQuestionIndex++
          this.renderQuestion()
          return
        }
        if (c.type === 'binary') this.renderBinary(q, c)
        else if (c.type === 'range') this.renderRange(q, c)
        else this.renderExact(q, c)
      }
      if (!q.required && q.question_type === 'clinical') {
        var self2 = this
        var skipBtn = document.createElement('button')
        skipBtn.className = 'pm-back-btn'
        skipBtn.style.marginTop = '4px'
        skipBtn.textContent = 'Skip this question'
        skipBtn.onclick = function () {
          self2.handleAnswer(q, null, 'Skipped')
        }
        body.appendChild(skipBtn)
      }
      if (q.question_type !== 'entry') {
        body.scrollTop = body.scrollHeight
      }
    },

    renderCaseTypes: function (q) {
      var self = this
      var opts = document.createElement('div')
      opts.className = 'pm-options'
      ;(this.data.caseTypes || []).forEach(function (ct) {
        var btn = document.createElement('button')
        btn.className = 'pm-option'
        btn.textContent = ct.name
        btn.onclick = function () {
          self.state.selectedCaseTypeId = ct.id
          self.state.activeOfferings = (self.data.offerings || []).filter(function (o) {
            return o.case_type_id === ct.id
          })
          self.handleAnswer(q, ct.id, ct.name)
        }
        opts.appendChild(btn)
      })
      var body = this.shadow.getElementById('pm-body')
      if (body) body.appendChild(opts)
    },

    renderLocationSelect: function (q) {
      var self = this
      var cfg = q.system_config || {}
      var locs = this.data.locations || []
      if (cfg.scope === 'specific' && cfg.location_ids && cfg.location_ids.length) {
        locs = locs.filter(function (l) {
          return cfg.location_ids.indexOf(l.id) > -1
        })
      }
      var wrap = document.createElement('div')
      wrap.className = 'pm-field-col'
      var sel = document.createElement('select')
      sel.className = 'pm-select'
      sel.innerHTML = '<option value="">Select a location...</option>'
      var noPreferenceOpt = document.createElement('option')
      noPreferenceOpt.value = 'no-preference'
      noPreferenceOpt.textContent = 'No preference'
      sel.appendChild(noPreferenceOpt)
      locs.forEach(function (l) {
        var opt = document.createElement('option')
        opt.value = l.id
        opt.textContent = l.name
        sel.appendChild(opt)
      })
      var btn = document.createElement('button')
      btn.className = 'pm-next-btn'
      btn.textContent = 'Next'
      btn.onclick = function () {
        if (!sel.value) return
        if (sel.value === 'no-preference') {
          self.handleAnswer(q, null, 'No preference')
          return
        }
        var loc = locs.find(function (l) {
          return l.id === sel.value
        })
        self.handleAnswer(q, sel.value, loc ? loc.name : sel.value)
      }
      wrap.appendChild(sel)
      wrap.appendChild(btn)
      var body = this.shadow.getElementById('pm-body')
      if (body) body.appendChild(wrap)
    },

    renderProviderChoice: function (q) {
      var self = this
      var opts = document.createElement('div')
      opts.className = 'pm-options'
      ;['Yes', 'No'].forEach(function (label) {
        var btn = document.createElement('button')
        btn.className = 'pm-option'
        btn.textContent = label
        btn.onclick = function () {
          if (label === 'Yes') {
            self.state.bypassMode = true
            self.state.offeringsBeforeBypass = self.state.activeOfferings.slice()
            self.state.bypassResumeIndex = self.state.currentQuestionIndex + 1
          }
          self.handleAnswer(q, label.toLowerCase(), label)
        }
        opts.appendChild(btn)
      })
      var body = this.shadow.getElementById('pm-body')
      if (body) body.appendChild(opts)
    },

    renderBinary: function (q, constraint) {
      var self = this
      var opts = document.createElement('div')
      opts.className = 'pm-options'
      ;[
        { label: constraint.yes_label || 'Yes', key: 'yes' },
        { label: constraint.no_label || 'No', key: 'no' },
      ].forEach(function (item) {
        var btn = document.createElement('button')
        btn.className = 'pm-option'
        btn.textContent = item.label
        btn.onclick = function () {
          var pickedYes = item.key === 'yes'
          self.state.activeOfferings = filterBinary(
            self.state.activeOfferings,
            constraint,
            pickedYes
          )
          self.handleAnswer(q, item.key, item.label)
        }
        opts.appendChild(btn)
      })
      var body = this.shadow.getElementById('pm-body')
      if (body) body.appendChild(opts)
    },

    renderRange: function (q, constraint) {
      var self = this
      var wrap = document.createElement('div')
      wrap.className = 'pm-number-wrap'
      var inp = document.createElement('input')
      inp.type = 'number'
      inp.className = 'pm-number-input'
      inp.min = constraint.min_allowed_value || 0
      inp.max = constraint.max_allowed_value || 999
      inp.placeholder = 'Enter number'
      var btn = document.createElement('button')
      btn.className = 'pm-next-btn'
      btn.textContent = 'Next'
      btn.onclick = function () {
        var val = Number(inp.value)
        if (isNaN(val)) return
        self.state.activeOfferings = filterRange(self.state.activeOfferings, constraint, val)
        self.handleAnswer(q, val, String(val))
      }
      wrap.appendChild(inp)
      wrap.appendChild(btn)
      var body = this.shadow.getElementById('pm-body')
      if (body) body.appendChild(wrap)
    },

    renderExact: function (q, constraint) {
      var self = this
      var values = getUniqueConstraintValues(this.state.activeOfferings, constraint.mapped_key)
      if (q.input_type === 'dropdown') {
        var wrap = document.createElement('div')
        wrap.className = 'pm-field-col'
        if (values.length === 0) {
          var inp = document.createElement('input')
          inp.type = 'text'
          inp.className = 'pm-number-input'
          inp.placeholder = 'Answer'
          var btn = document.createElement('button')
          btn.className = 'pm-next-btn'
          btn.textContent = 'Next'
          btn.onclick = function () {
            var t = (inp.value || '').trim()
            if (!t) return
            self.state.activeOfferings = filterExact(self.state.activeOfferings, constraint, t)
            self.handleAnswer(q, t, t)
          }
          wrap.appendChild(inp)
          wrap.appendChild(btn)
        } else {
          var sel = document.createElement('select')
          sel.className = 'pm-select'
          sel.innerHTML = '<option value="">Select...</option>'
          values.forEach(function (v) {
            var opt = document.createElement('option')
            opt.value = v
            opt.textContent = v
            sel.appendChild(opt)
          })
          var btn2 = document.createElement('button')
          btn2.className = 'pm-next-btn'
          btn2.textContent = 'Next'
          btn2.onclick = function () {
            if (!sel.value) return
            self.state.activeOfferings = filterExact(
              self.state.activeOfferings,
              constraint,
              sel.value
            )
            self.handleAnswer(q, sel.value, sel.value)
          }
          wrap.appendChild(sel)
          wrap.appendChild(btn2)
        }
        var body = this.shadow.getElementById('pm-body')
        if (body) body.appendChild(wrap)
      } else {
        var opts = document.createElement('div')
        opts.className = 'pm-options'
        if (values.length === 0) {
          var inp2 = document.createElement('input')
          inp2.type = 'text'
          inp2.className = 'pm-number-input'
          inp2.placeholder = 'Answer'
          var btn3 = document.createElement('button')
          btn3.className = 'pm-next-btn'
          btn3.textContent = 'Next'
          btn3.onclick = function () {
            var t = (inp2.value || '').trim()
            if (!t) return
            self.state.activeOfferings = filterExact(self.state.activeOfferings, constraint, t)
            self.handleAnswer(q, t, t)
          }
          opts.appendChild(inp2)
          opts.appendChild(btn3)
        } else {
          values.forEach(function (v) {
            var btn4 = document.createElement('button')
            btn4.className = 'pm-option'
            btn4.textContent = v
            btn4.onclick = function () {
              self.state.activeOfferings = filterExact(self.state.activeOfferings, constraint, v)
              self.handleAnswer(q, v, v)
            }
            opts.appendChild(btn4)
          })
        }
        var body2 = this.shadow.getElementById('pm-body')
        if (body2) body2.appendChild(opts)
      }
    },

    handleAnswer: function (q, value, displayText) {
      var self = this
      this.state.answers[q.id] = value
      if (this.state.activeOfferings.length === 0) {
        this.showZeroResults()
        return
      }
      if (q.question_type === 'location') {
        this.state.selectedLocationId = value
      }
      this.state.history.push({
        questionIndex: this.state.currentQuestionIndex,
        offerings: this.state.activeOfferings.slice(),
        answers: Object.assign({}, this.state.answers),
        selectedCaseTypeId: this.state.selectedCaseTypeId,
        selectedLocationId: this.state.selectedLocationId,
        bypassMode: this.state.bypassMode,
        bypassResumeIndex: this.state.bypassResumeIndex,
        offeringsBeforeBypass: this.state.offeringsBeforeBypass
          ? this.state.offeringsBeforeBypass.slice()
          : null,
      })
      this.addBubble(displayText, true)
      var body = this.shadow.getElementById('pm-body')
      if (body) {
        var toRemove = body.querySelectorAll(
          '.pm-options,.pm-number-wrap,.pm-field-col,.pm-select,.pm-next-btn,.pm-back-btn'
        )
        toRemove.forEach(function (el) {
          el.remove()
        })
        body.querySelectorAll('select').forEach(function (el) {
          if (el.parentNode) el.parentNode.remove()
        })
      }
      var seqLen = this.getQuestionSequence().length
      if (this.state.bypassMode) {
        setTimeout(function () {
          self.showResults()
        }, 300)
        return
      }
      if (this.state.currentQuestionIndex >= seqLen - 1) {
        setTimeout(function () {
          self.showResults()
        }, 300)
        return
      }
      this.state.currentQuestionIndex++
      setTimeout(function () {
        self.renderQuestion()
      }, 300)
    },

    goBack: function () {
      if (!this.state.history.length) return
      var last = this.state.history.pop()
      this.state.currentQuestionIndex = last.questionIndex
      this.state.activeOfferings = last.offerings
      this.state.answers = last.answers
      this.state.selectedCaseTypeId = last.selectedCaseTypeId
      this.state.selectedLocationId = last.selectedLocationId
      this.state.bypassMode = last.bypassMode
      this.state.bypassResumeIndex = last.bypassResumeIndex
      this.state.offeringsBeforeBypass = last.offeringsBeforeBypass
        ? last.offeringsBeforeBypass.slice()
        : null
      var body = this.shadow.getElementById('pm-body')
      if (body) body.innerHTML = ''
      var seq = this.getQuestionSequence()
      for (var i = 0; i < last.questionIndex; i++) {
        var q = seq[i]
        if (!q) continue
        this.addBubble(q.question_text, false)
        var ans = last.answers[q.id]
        if (ans !== undefined && ans !== null) {
          if (q.question_type === 'location') {
            var loc = (this.data.locations || []).find(function(l) { return l.id === ans })
            this.addBubble(loc ? loc.name : 'No preference', true)
          } else {
            this.addBubble(String(ans), true)
          }
        }
      }
      this.renderQuestion()
    },

    showZeroResults: function () {
      var self = this
      var body = this.shadow.getElementById('pm-body')
      if (!body) return
      body.innerHTML = ''
      var config = this.data.config || {}
      var div = document.createElement('div')
      div.className = 'pm-fallback'
      var msg = document.createElement('div')
      msg.className = 'pm-fb-msg'
      msg.textContent =
        config.fallback_message || "We couldn't find a match for your criteria."
      div.appendChild(msg)
      if (config.fallback_phone) {
        var phone = document.createElement('div')
        phone.className = 'pm-fb-phone'
        phone.textContent = config.fallback_phone
        div.appendChild(phone)
      }
      var restartBtn = document.createElement('button')
      restartBtn.className = 'pm-restart'
      restartBtn.textContent = 'Start Over'
      restartBtn.onclick = function () {
        self.resetState()
        self.startFlow()
      }
      div.appendChild(restartBtn)
      body.appendChild(div)
      this.trackSession(true)
    },

    showResults: function () {
      var self = this
      this.state.phase = 'results'
      var body = this.shadow.getElementById('pm-body')
      if (!body) return
      body.innerHTML = ''
      var seen = {}
      var unique = []
      this.state.activeOfferings.forEach(function (o) {
        if (!seen[o.provider_id]) {
          seen[o.provider_id] = true
          var provider = (self.data.providers || []).find(function (p) {
            return p.id === o.provider_id
          })
          if (provider) unique.push({ provider: provider, offering: o })
        }
      })
      if (!unique.length) {
        this.showZeroResults()
        return
      }
      unique = fisherYatesShuffle(unique)
      var results = document.createElement('div')
      results.className = 'pm-results'
      var caseTypeName = ''
      var selectedCaseType = (self.data.caseTypes || []).find(function (ct) { return ct.id === self.state.selectedCaseTypeId })
      if (selectedCaseType) caseTypeName = selectedCaseType.name
      var selectedLocName = ''
      if (self.state.selectedLocationId) {
        var selectedLocForHeader = (self.data.locations || []).find(function (l) { return l.id === self.state.selectedLocationId })
        if (selectedLocForHeader) selectedLocName = selectedLocForHeader.name
      }
      if (caseTypeName) {
        var header = document.createElement('div')
        header.style.cssText = 'font-size:15px;font-weight:600;color:#1e293b;padding:4px 0 12px;'
        header.textContent = 'Results for ' + caseTypeName + (selectedLocName ? ' at ' + selectedLocName : '')
        results.appendChild(header)
      }
      if (this.state.bypassMode) {
        var search = document.createElement('input')
        search.className = 'pm-search'
        search.placeholder = 'Search by provider name...'
        search.oninput = function () {
          var q = search.value.toLowerCase()
          results.querySelectorAll('.pm-card').forEach(function (card) {
            var name = card.querySelector('.pm-name')
            if (name)
              card.style.display = name.textContent.toLowerCase().indexOf(q) > -1 ? '' : 'none'
          })
        }
        results.appendChild(search)
        var infoText = document.createElement('div')
        infoText.style.cssText = 'font-size:12px;color:#64748b;padding:4px 0 8px;'
        infoText.textContent = "If your provider isn't listed, they may not treat this condition."
        results.appendChild(infoText)
        var helpLink = document.createElement('div')
        helpLink.className = 'pm-help'
        helpLink.textContent = 'Help me choose instead'
        helpLink.onclick = function () {
          self.state.bypassMode = false
          body.innerHTML = ''
          if (self.state.offeringsBeforeBypass && self.state.offeringsBeforeBypass.length) {
            self.state.activeOfferings = self.state.offeringsBeforeBypass.slice()
          }
          self.state.currentQuestionIndex =
            self.state.bypassResumeIndex != null
              ? self.state.bypassResumeIndex
              : self.state.currentQuestionIndex + 1
          self.state.offeringsBeforeBypass = null
          self.state.bypassResumeIndex = null
          self.renderQuestion()
        }
        results.appendChild(helpLink)
        unique.forEach(function (item) {
          results.appendChild(self.buildCard(item.provider))
        })
      } else {
        var remaining = unique.slice()
        if (this.state.selectedLocationId) {
          var atLoc = remaining.filter(function (item) {
            return (
              item.offering.location_ids &&
              item.offering.location_ids.indexOf(self.state.selectedLocationId) > -1
            )
          })
          var outsideLoc = remaining.filter(function (item) {
            return (
              !item.offering.location_ids ||
              item.offering.location_ids.indexOf(self.state.selectedLocationId) === -1
            )
          })
          var locName = ''
          var foundLoc = (this.data.locations || []).find(function (l) {
            return l.id === self.state.selectedLocationId
          })
          if (foundLoc) locName = foundLoc.name
          var sec2 = document.createElement('div')
          sec2.className = 'pm-section-title'
          sec2.textContent = 'Providers at ' + locName
          results.appendChild(sec2)
          if (!atLoc.length) {
            var noMatch = document.createElement('div')
            noMatch.style.cssText = 'font-size:13px;color:#64748b;padding:8px 0;'
            noMatch.textContent =
              'There are no specialists for this case type at ' + locName + '.'
            results.appendChild(noMatch)
          } else {
            atLoc.forEach(function (item) {
              results.appendChild(self.buildCard(item.provider))
            })
          }
          if (outsideLoc.length) {
            var sec3 = document.createElement('div')
            sec3.className = 'pm-section-title'
            sec3.textContent = 'Providers outside ' + locName
            results.appendChild(sec3)
            outsideLoc.forEach(function (item) {
              results.appendChild(self.buildCard(item.provider))
            })
          }
        } else {
          remaining.forEach(function (item) {
            results.appendChild(self.buildCard(item.provider))
          })
        }
      }
      var config = this.data.config || {}
      if (config.disclaimer_text) {
        var disc = document.createElement('div')
        disc.className = 'pm-disclaimer'
        disc.textContent = config.disclaimer_text
        results.appendChild(disc)
      }
      var restartBtn = document.createElement('button')
      restartBtn.className = 'pm-restart'
      restartBtn.textContent = 'Start Over'
      restartBtn.onclick = function() { self.resetState(); self.startFlow(); }
      results.appendChild(restartBtn)
      body.appendChild(results)
      this.trackSession(false)
    },

    renderGrouped: function (container, items) {
      var self = this
      var seen = {}
      var unique = []
      items.forEach(function (item) {
        if (!seen[item.provider.id]) {
          seen[item.provider.id] = true
          unique.push(item.provider)
        }
      })
      unique.forEach(function (provider) {
        container.appendChild(self.buildCard(provider))
      })
    },

    buildCard: function (provider) {
      var self = this
      var config = this.data.config || {}

      // Determine effective booking mode and phone mode
      var orgBookingMode = config.default_booking_mode || 'simple'
      var orgPhoneMode = config.default_phone_mode || 'simple'
      var bookingMode = provider.booking_mode === 'default' ? orgBookingMode : (provider.booking_mode || orgBookingMode)
      var phoneMode = provider.phone_mode === 'default' ? orgPhoneMode : (provider.phone_mode || orgPhoneMode)

      // Get provider locations
      var provLocs = (this.data.providerLocations || []).filter(function (pl) {
        return pl.provider_id === provider.id
      })

      // Build card
      var card = document.createElement('div')
      card.className = 'pm-card'

      // Avatar
      var avatar
      if (provider.image_url) {
        avatar = document.createElement('img')
        avatar.src = provider.image_url
        avatar.alt = provider.name
        avatar.className = 'pm-avatar'
      } else {
        avatar = document.createElement('div')
        avatar.className = 'pm-avatar'
        var colors = ['#6366f1','#8b5cf6','#a855f7','#3b82f6','#0ea5e9','#06b6d4','#10b981','#22c55e','#f59e0b','#f97316','#ef4444','#ec4899','#d946ef','#14b8a6','#84cc16','#e11d48','#7c3aed','#2563eb','#0891b2','#059669']
        var idx = provider.name.split('').reduce(function (a, c) { return a + c.charCodeAt(0) }, 0) % colors.length
        avatar.style.background = colors[idx]
        var words = provider.name.trim().split(/\s+/).filter(Boolean)
        avatar.textContent = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ? words[0][0] : '')).toUpperCase()
      }

      // Info section
      var info = document.createElement('div')
      info.className = 'pm-info'

      var name = document.createElement('div')
      name.className = 'pm-name'
      name.textContent = provider.name
      info.appendChild(name)

      if (provider.subtitle) {
        var sub = document.createElement('div')
        sub.className = 'pm-sub'
        sub.textContent = provider.subtitle
        info.appendChild(sub)
      }

      // Category pills
      var catPills = document.createElement('div')
      catPills.className = 'pm-pills'
      ;(provider.category_ids || []).forEach(function (catId) {
        var cat = (self.data.categories || []).find(function (c) { return c.id === catId })
        if (cat) {
          var pill = document.createElement('span')
          pill.className = 'pm-cat-pill'
          pill.textContent = cat.name
          catPills.appendChild(pill)
        }
      })
      if (catPills.children.length) info.appendChild(catPills)

      // Location pills — from offerings
      var providerOfferingLocationIds = []
      ;(self.data.offerings || []).forEach(function (o) {
        if (o.provider_id === provider.id) {
          ;(o.location_ids || []).forEach(function (lid) {
            if (providerOfferingLocationIds.indexOf(lid) === -1) {
              providerOfferingLocationIds.push(lid)
            }
          })
        }
      })
      if (providerOfferingLocationIds.length) {
        var locPills = document.createElement('div')
        locPills.className = 'pm-locs'
        providerOfferingLocationIds.forEach(function (lid) {
          var loc = (self.data.locations || []).find(function (l) { return l.id === lid })
          if (loc) {
            var pill = document.createElement('span')
            pill.className = 'pm-loc-pill'
            pill.textContent = '📍 ' + loc.name
            locPills.appendChild(pill)
          }
        })
        if (locPills.children.length) info.appendChild(locPills)
      }

      // View Profile link
      if (provider.bio_link) {
        var profileLink = document.createElement('a')
        profileLink.className = 'pm-view-profile'
        profileLink.href = provider.bio_link
        profileLink.target = '_blank'
        profileLink.rel = 'noopener noreferrer'
        profileLink.textContent = '👤 View Profile →'
        info.appendChild(profileLink)
      }

      var cardTop = document.createElement('div')
      cardTop.style.cssText = 'display:flex;gap:12px;align-items:flex-start;'
      cardTop.appendChild(avatar)
      cardTop.appendChild(info)
      card.appendChild(cardTop)

      // Actions — full width below info
      var actionsArea = document.createElement('div')
      actionsArea.style.cssText = 'margin-top:10px;border-top:0.5px solid #e2e8f0;padding-top:10px;'

      var defaultPanel = document.createElement('div')
      defaultPanel.style.cssText = 'display:flex;flex-direction:column;gap:6px;'

      // --- BOOKING BUTTON ---
      var bookingLocsWithLinks = provLocs.filter(function (pl) { return pl.booking_link })

      if (this.state.selectedLocationId) {
        var selectedPl = provLocs.find(function (pl) { return pl.location_id === self.state.selectedLocationId })
        var selectedLoc = (this.data.locations || []).find(function (l) { return l.id === self.state.selectedLocationId })
        if (selectedPl && selectedPl.booking_link) {
          var bookBtn = document.createElement('a')
          bookBtn.className = 'pm-book'
          bookBtn.href = selectedPl.booking_link
          bookBtn.target = '_blank'
          bookBtn.rel = 'noopener noreferrer'
          bookBtn.textContent = 'Book at ' + (selectedLoc ? selectedLoc.name : 'Location')
          bookBtn.onclick = function () { self.trackClick(provider.id) }
          defaultPanel.appendChild(bookBtn)
        } else if (bookingLocsWithLinks.length && (bookingLocsWithLinks.length === 1 || bookingMode === 'simple')) {
          var firstPlFallback = bookingLocsWithLinks[0]
          if (firstPlFallback) {
            var firstLocFallback = (this.data.locations || []).find(function (l) { return l.id === firstPlFallback.location_id })
            var bookBtnFallback = document.createElement('a')
            bookBtnFallback.className = 'pm-book'
            bookBtnFallback.href = firstPlFallback.booking_link
            bookBtnFallback.target = '_blank'
            bookBtnFallback.rel = 'noopener noreferrer'
            bookBtnFallback.textContent = bookingLocsWithLinks.length === 1 ? 'Book at ' + (firstLocFallback ? firstLocFallback.name : 'Location') : 'Book Now'
            bookBtnFallback.onclick = function () { self.trackClick(provider.id) }
            defaultPanel.appendChild(bookBtnFallback)
          }
        } else if (bookingLocsWithLinks.length > 1) {
          var bookTriggerFallback = document.createElement('button')
          bookTriggerFallback.className = 'pm-book'
          bookTriggerFallback.textContent = 'Book Now'
          bookTriggerFallback.onclick = function () {
            defaultPanel.style.display = 'none'
            bookSlide.style.display = 'flex'
          }
          defaultPanel.appendChild(bookTriggerFallback)
        }
      } else if (bookingLocsWithLinks.length && (bookingLocsWithLinks.length === 1 || bookingMode === 'simple')) {
        var firstPl = bookingLocsWithLinks[0]
        if (firstPl) {
          var firstLoc = (this.data.locations || []).find(function (l) { return l.id === firstPl.location_id })
          var bookBtn2 = document.createElement('a')
          bookBtn2.className = 'pm-book'
          bookBtn2.href = firstPl.booking_link
          bookBtn2.target = '_blank'
          bookBtn2.rel = 'noopener noreferrer'
          bookBtn2.textContent = bookingLocsWithLinks.length === 1 ? 'Book at ' + (firstLoc ? firstLoc.name : 'Location') : 'Book Now'
          bookBtn2.onclick = function () { self.trackClick(provider.id) }
          defaultPanel.appendChild(bookBtn2)
        }
      } else if (bookingLocsWithLinks.length > 1) {
        var bookTrigger = document.createElement('button')
        bookTrigger.className = 'pm-book'
        bookTrigger.textContent = 'Book Now'
        bookTrigger.onclick = function () {
          defaultPanel.style.display = 'none'
          bookSlide.style.display = 'flex'
        }
        defaultPanel.appendChild(bookTrigger)
      }

      // --- PHONE BUTTON ---
      var phoneLocsWithNumbers = provLocs.filter(function (pl) { return pl.phone })

      if (phoneLocsWithNumbers.length > 0) {
        if (this.state.selectedLocationId) {
          var selPhonePl = provLocs.find(function (pl) { return pl.location_id === self.state.selectedLocationId })
          var selPhoneLoc = (this.data.locations || []).find(function (l) { return l.id === self.state.selectedLocationId })
          if (selPhonePl && selPhonePl.phone) {
            var callBtn = document.createElement('a')
            callBtn.className = 'pm-call'
            callBtn.href = 'tel:' + selPhonePl.phone
            callBtn.textContent = '📞 Call ' + (selPhoneLoc ? selPhoneLoc.name : 'Office')
            defaultPanel.appendChild(callBtn)
          } else if (phoneLocsWithNumbers.length && (phoneLocsWithNumbers.length === 1 || phoneMode === 'simple')) {
            var firstPhoneFallback = phoneLocsWithNumbers[0]
            var firstPhoneLocFallback = (this.data.locations || []).find(function (l) { return l.id === firstPhoneFallback.location_id })
            var callBtnFallback = document.createElement('a')
            callBtnFallback.className = 'pm-call'
            callBtnFallback.href = 'tel:' + firstPhoneFallback.phone
            callBtnFallback.textContent = '📞 Call ' + (phoneLocsWithNumbers.length === 1 ? (firstPhoneLocFallback ? firstPhoneLocFallback.name : 'Office') : 'Office')
            defaultPanel.appendChild(callBtnFallback)
          } else if (phoneLocsWithNumbers.length > 1) {
            var callTriggerFallback = document.createElement('button')
            callTriggerFallback.className = 'pm-call'
            callTriggerFallback.textContent = '📞 Call Office'
            callTriggerFallback.onclick = function () {
              defaultPanel.style.display = 'none'
              callSlide.style.display = 'flex'
            }
            defaultPanel.appendChild(callTriggerFallback)
          }
        } else if (phoneLocsWithNumbers.length && (phoneLocsWithNumbers.length === 1 || phoneMode === 'simple')) {
          var firstPhonePl = phoneLocsWithNumbers[0]
          var firstPhoneLoc = (this.data.locations || []).find(function (l) { return l.id === firstPhonePl.location_id })
          var callBtn2 = document.createElement('a')
          callBtn2.className = 'pm-call'
          callBtn2.href = 'tel:' + firstPhonePl.phone
          callBtn2.textContent = '📞 Call ' + (phoneLocsWithNumbers.length === 1 ? (firstPhoneLoc ? firstPhoneLoc.name : 'Office') : 'Office')
          defaultPanel.appendChild(callBtn2)
        } else {
          var callTrigger = document.createElement('button')
          callTrigger.className = 'pm-call'
          callTrigger.textContent = '📞 Call Office'
          callTrigger.onclick = function () {
            defaultPanel.style.display = 'none'
            callSlide.style.display = 'flex'
          }
          defaultPanel.appendChild(callTrigger)
        }
      }

      actionsArea.appendChild(defaultPanel)

      // --- BOOKING SLIDE ---
      var bookSlide = document.createElement('div')
      bookSlide.style.cssText = 'display:none;flex-direction:column;gap:6px;'
      var bookLabel = document.createElement('div')
      bookLabel.style.cssText = 'font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;text-align:center;'
      bookLabel.textContent = 'Book at...'
      bookSlide.appendChild(bookLabel)
      bookingLocsWithLinks.forEach(function (pl) {
        var loc = (self.data.locations || []).find(function (l) { return l.id === pl.location_id })
        var btn = document.createElement('a')
        btn.className = 'pm-book'
        btn.href = pl.booking_link
        btn.target = '_blank'
        btn.rel = 'noopener noreferrer'
        btn.textContent = loc ? loc.name : 'Location'
        btn.onclick = function () { self.trackClick(provider.id) }
        bookSlide.appendChild(btn)
      })
      var bookBack = document.createElement('button')
      bookBack.className = 'pm-back-link'
      bookBack.textContent = '← back'
      bookBack.onclick = function () {
        bookSlide.style.display = 'none'
        defaultPanel.style.display = 'flex'
      }
      bookSlide.appendChild(bookBack)
      actionsArea.appendChild(bookSlide)

      // --- CALL SLIDE ---
      var callSlide = document.createElement('div')
      callSlide.style.cssText = 'display:none;flex-direction:column;gap:6px;'
      var callLabel = document.createElement('div')
      callLabel.style.cssText = 'font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;text-align:center;'
      callLabel.textContent = 'Call...'
      callSlide.appendChild(callLabel)
      phoneLocsWithNumbers.forEach(function (pl) {
        var loc = (self.data.locations || []).find(function (l) { return l.id === pl.location_id })
        var btn = document.createElement('button')
        btn.className = 'pm-call'
        btn.textContent = '📞 ' + (loc ? loc.name : 'Office')
        btn.onclick = function () { window.location.href = 'tel:' + pl.phone }
        callSlide.appendChild(btn)
      })
      var callBack = document.createElement('button')
      callBack.className = 'pm-back-link'
      callBack.textContent = '← back'
      callBack.onclick = function () {
        callSlide.style.display = 'none'
        defaultPanel.style.display = 'flex'
      }
      callSlide.appendChild(callBack)
      actionsArea.appendChild(callSlide)

      if (defaultPanel.children.length > 0 || bookingLocsWithLinks.length > 1 || phoneLocsWithNumbers.length > 1) {
        card.appendChild(actionsArea)
      }

      return card
    },

    trackSession: async function (zeroResults) {
      try {
        await fetch(SUPABASE_URL + '/functions/v1/track-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            widget_id: this.widgetId,
            session_id: this.state.sessionId,
            case_type_id: this.state.selectedCaseTypeId,
            answers: this.state.answers,
            results_count: this.state.activeOfferings.length,
            zero_results: zeroResults,
            providers_clicked: [],
          }),
        })
      } catch (e) {
        /* silent */
      }
    },

    trackClick: function (providerId) {
      try {
        fetch(SUPABASE_URL + '/functions/v1/track-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            widget_id: this.widgetId,
            session_id: this.state.sessionId,
            provider_id: providerId,
            type: 'click',
          }),
        })
      } catch (e) {
        /* silent */
      }
    },
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      widget.init()
    })
  } else {
    widget.init()
  }

  window._ProviderMatcher = widget
})()
