package com.phlox.tvwebbrowser.widgets.cursor

import android.content.Context
import android.graphics.Canvas
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.ViewConfigurationCompat
import androidx.core.view.WindowInsetsCompat
import com.phlox.tvwebbrowser.AppContext
import com.phlox.tvwebbrowser.utils.DPADNavigationEventsAdapter


/**
 * Created by PDT on 25.08.2016.
 */
class CursorLayout @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null):
    FrameLayout(context, attrs), PointerTarget {
    var cursorEnabled: Boolean
        get() = !willNotDraw()
        set(value) {
            if (value == cursorEnabled) return
            // the page must not keep a press or a hover whose end can no longer reach the cursor
            if (!value) cursorDrawerDelegate.cancelActiveGestures()
            setWillNotDraw(!value)
        }
    lateinit var cursorDrawerDelegate: CursorDrawerDelegate
    private val inputEventsAdapter = DPADNavigationEventsAdapter(
        onDirection = { x, y, discrete -> cursorDrawerDelegate.setDirection(x, y, discrete) },
        onKeyEvent = { keyEvent -> cursorDrawerDelegate.dispatchKeyEvent(keyEvent) },
        analogStickNavigationEnabled = { !AppContext.provideConfig().disableMotionAxesDpadNavigation },
        isSoftwareKeyboardVisible = {
            ViewCompat.getRootWindowInsets(rootView)?.isVisible(WindowInsetsCompat.Type.ime()) == true
        },
    )

    init {
        init()
    }

    private fun init() {
        if (isInEditMode) {
            return
        }
        setWillNotDraw(false)
        cursorDrawerDelegate = CursorDrawerDelegate(context, this, this)
        cursorDrawerDelegate.init()
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        super.onSizeChanged(w, h, ow, oh)
        if (isInEditMode || willNotDraw()) {
            return
        }
        cursorDrawerDelegate.onSizeChanged(w, h, ow, oh)
    }

    override fun setWillNotDraw(willNotDraw: Boolean) {
        inputEventsAdapter.resetState()
        super.setWillNotDraw(willNotDraw)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Direction keys are the whole D-pad: cursor mode owns them outright so the page or its
        // video player can never intercept them (otherwise a <video> element under the cursor would
        // seek or change volume on every press). Direct navigation passes them through.
        val isDpadKey = event.keyCode in DPAD_KEYCODES
        if (willNotDraw()) {
            return super.dispatchKeyEvent(event)
        }

        // cursor enabled
        val consumed = inputEventsAdapter.dispatchKeyEvent(event)
        if (isDpadKey) {
            // always consumed by the cursor layer — not even ACTION_UP leaks to the page
            return true
        }
        if (consumed) return true
        return super.dispatchKeyEvent(event)
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        if (willNotDraw()) return super.dispatchGenericMotionEvent(event)

        if (inputEventsAdapter.dispatchGenericMotionEvent(event)) {
            return true
        }

        return super.dispatchGenericMotionEvent(event)
    }

    override fun dispatchSyntheticTouch(event: MotionEvent): Boolean = dispatchTouchEvent(event)

    /** `super`: the hover and wheel events of the cursor go to the page, not to the D-pad adapter */
    override fun dispatchSyntheticGenericMotion(event: MotionEvent): Boolean =
        super.dispatchGenericMotionEvent(event)

    /** Set by the engine, which knows how its page takes a mouse press */
    override var mouseClicks: MouseClicks = MouseClicks.BUTTON_STATE

    /** WebView scrolls by the scroll factor of the system for one wheel click */
    override val wheelScrollFactor: Float
        get() = ViewConfigurationCompat.getScaledVerticalScrollFactor(ViewConfiguration.get(context), context)

    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        if (isInEditMode || willNotDraw()) {
            return
        }

        cursorDrawerDelegate.dispatchDraw(canvas)
    }

    companion object {
        private val DPAD_KEYCODES = setOf(
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN
        )
    }
}
