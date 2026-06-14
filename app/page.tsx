import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="Dev Kilo Zin" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-semibold text-gray-900">Dev Kilo Zin</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-blue-100">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Powered by Claude &amp; SEA-LION AI
        </div>

        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-5">
          Auto-fill Google Forms<br />
          <span className="text-blue-600">at scale with AI</span>
        </h1>

        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8 leading-relaxed">
          Paste a Google Form URL, configure how you want each question answered,
          and let AI submit realistic responses — at any volume you need.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Start for free
          </Link>
          <Link
            href="#how-it-works"
            className="border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 font-medium px-6 py-3 rounded-xl transition-colors text-sm"
          >
            See how it works
          </Link>
        </div>

        <p className="text-xs text-gray-400 mt-4">$0.10 per 10 respondents · No subscription</p>
      </section>

      {/* App screenshot placeholder / preview card */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-300" />
            <div className="w-3 h-3 rounded-full bg-yellow-300" />
            <div className="w-3 h-3 rounded-full bg-green-300" />
            <div className="ml-3 flex-1 bg-gray-100 rounded px-3 py-1 text-xs text-gray-400">
              https://docs.google.com/forms/d/...
            </div>
          </div>
          <div className="p-6 grid grid-cols-3 gap-4">
            {[
              { step: '1', label: 'Paste form URL', desc: 'Inspect any public Google Form in seconds', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
              { step: '2', label: 'Configure answers', desc: 'Set % distributions or let AI decide per question', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { step: '3', label: 'Pay & run', desc: 'AI submits real responses via a headless browser', icon: 'M5 13l4 4L19 7' },
            ].map(({ step, label, desc, icon }) => (
              <div key={step} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold mb-3">
                  {step}
                </div>
                <p className="text-sm font-semibold text-gray-800 mb-1">{label}</p>
                <p className="text-xs text-gray-400 leading-snug">{desc}</p>
                <svg className="w-5 h-5 text-blue-400 mt-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
                </svg>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-gray-50 border-y border-gray-100 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-3">How it works</h2>
          <p className="text-gray-400 text-sm text-center mb-12">Three steps from URL to filled responses</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                title: 'Inspect your form',
                body: 'Paste any Google Form URL. Our headless browser reads every question, type, and option automatically.',
              },
              {
                title: 'Configure distributions',
                body: 'For choice questions, set percentage weights per option. Or switch to AI mode and let the model decide naturally.',
              },
              {
                title: 'Set personas & start',
                body: 'Optionally define respondent personas (e.g. 60% farmers, 40% students). Pay, and AI does the rest.',
              },
            ].map(({ title, body }, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-3xl font-black text-blue-100 leading-none mt-0.5 select-none">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-3">Everything you need</h2>
          <p className="text-gray-400 text-sm text-center mb-12">Built for researchers, survey creators, and developers</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.346.346a51.52 51.52 0 01-1.55 1.55C10.94 18.79 9 17.5 9 16a3 3 0 01.072-.285',
                title: 'Two AI providers',
                desc: 'Choose between Claude (Anthropic) for highest quality or SEA-LION (AI Singapore) for Southeast Asia-focused responses.',
              },
              {
                icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
                title: '% distribution control',
                desc: 'Precisely control how often each option is selected. Set 70% for option A and 30% for option B, or randomize.',
              },
              {
                icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
                title: 'Respondent personas',
                desc: 'Define named profiles with descriptions. Assign percentage splits so responses reflect realistic population diversity.',
              },
              {
                icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
                title: 'Headless browser',
                desc: 'Real browser automation — forms are filled exactly as a human would, passing bot-detection measures.',
              },
              {
                icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
                title: 'Secure auth',
                desc: 'Accounts are protected by Supabase Auth. Your form URLs and configurations are stored privately.',
              },
              {
                icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                title: 'Simple pricing',
                desc: 'No subscriptions. Pay only for what you use — $0.10 per 10 respondents, charged at checkout.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="border border-gray-200 rounded-xl p-5 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 text-sm mb-1.5">{title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-gray-50 border-y border-gray-100 py-20 px-6">
        <div className="max-w-sm mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Simple pricing</h2>
          <p className="text-gray-400 text-sm mb-8">Pay only for what you use</p>
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="flex items-end justify-center gap-1 mb-2">
              <span className="text-5xl font-black text-gray-900">$0.10</span>
              <span className="text-gray-400 text-sm mb-2">/ 10 respondents</span>
            </div>
            <p className="text-xs text-gray-400 mb-6">Billed per batch at checkout</p>
            <ul className="text-sm text-gray-600 space-y-2.5 text-left mb-8">
              {[
                '10 respondents → $0.10',
                '100 respondents → $1.00',
                '1,000 respondents → $10.00',
                'All question types supported',
                'Both AI providers included',
              ].map(item => (
                <li key={item} className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors text-center"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to fill your forms?</h2>
          <p className="text-gray-500 text-sm mb-8">Create an account and run your first batch in minutes.</p>
          <Link
            href="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-sm"
          >
            Create free account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="Dev Kilo Zin" className="w-6 h-6 rounded object-cover" />
            <span className="text-sm text-gray-500">Dev Kilo Zin</span>
          </div>
          <p className="text-xs text-gray-400">AI-Powered Google Form Auto-Filler</p>
        </div>
      </footer>

    </div>
  );
}
