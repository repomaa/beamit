App = {
	slides: null,
	slideIndex: 0,
	slideIndexInput: '',
	timeLimit: null,
	startTime: null,
	socket: null,
	isPresenter: false,
	hasControl: false,
	isRemote: false,

	init: function () {
		this.isPresenter = $('body').hasClass('presenter');
		this.isRemote = $('body').hasClass('remote');
		this.connection = new WebSocket('ws://' + location.host + '/' + $('body').data('socket-url'));
		var onOpen = [];

		if (this.isPresenter) {
			this.setupPresenter();
		}
		if (this.isRemote) {
			this.setupRemote();
		}

		this.setupSlides();
		this.setupWebSocketCallbacks();
		this.setupKeybindings();
		this.setupHighlightJS();
		this.setupQrs();

		this.connection.onopen = _.bind(function () {
			this.setupFromHash();
			window.addEventListener('hashchange', _.bind(function () {
				this.setupFromHash();
				if (this.isPresenter && this.hasControl) {
					this.synchronize();
				}
			}, this), false);
			if (this.isPresenter) {
				this.broadcastEvent('registerPresenter');
				this.broadcastEvent('timeSync');
			} else {
				this.broadcastEvent('requestSynchronize');
			}
		}, this);
	},

	setupQrs: function () {
		$('.qr').each(function () {
			new QRCode(this, {
				text: $(this).data('text')
			});
		});
	},

	setupPresenter: function () {
		this.startTime = new Date();
		this.timeLimit = $('body').data('time-limit') * 1000 * 60;
		this.presenterToken = $('body').data('presenter-token');
		if (this.timeLimit) {
			window.setInterval(_.bind(this.updateTimeProgress, this), 1000);
		}
	},

	setupRemote: function () {
		var goToSlide = _.bind(this.goToSlide, this);
		var previousSlide = _.bind(this.previousSlide, this);
		var next = _.bind(this.next, this);
		var broadcastEvent = _.bind(this.broadcastEvent, this);
		$('#toc-select').on('change', function (event) {
			goToSlide($(this).val());
			if (!this.hasControl) {
				broadcastEvent('registerPresenter');
			}
		});
		var previousHandler = function (event) {
			previousSlide();
			if (!this.hasControl) {
				broadcastEvent('registerPresenter');
			}
			event.preventDefault();
			return false;
		};
		var nextHandler = function (event) {
			next();
			if (!this.hasControl) {
				broadcastEvent('registerPresenter');
			}
			event.preventDefault();
			return false;
		};
		$('#previous-link').on('click', previousHandler);
		$('#next-link').on('click', nextHandler);
		$(document).on('swipeleft', nextHandler);
		$(document).on('swiperight', previousHandler);
	},

	setupWebSocketCallbacks: function () {
		var socketCallbacks = {};
		if (this.isPresenter) {
			socketCallbacks.requestSynchronize = _.bind(function () {
				this.synchronize();
			}, this);
			socketCallbacks.disown = _.bind(function () {
				this.hasControl = false;
			}, this);
			socketCallbacks.empower = _.bind(function () {
				this.hasControl = true;
				this.synchronize();
			}, this);
			socketCallbacks.timeSync = _.bind(function (data) {
				this.startTime = new Date();
			}, this);
		}
		socketCallbacks.synchronize = _.bind(function (data) {
			this.synchronize(data.slideIndex, data.pauseIndexes);
		}, this);

		this.connection.onmessage = _.bind(function (message) {
			var data = JSON.parse(message.data);
			if (socketCallbacks[data.event]) {
				socketCallbacks[data.event](data);
			}
		}, this);
	},

	setupSlides: function () {
		this.slides = _.map($('.slides .slide'), function (slide) {
			var pauses = $(slide).find('.pause');
			return {
				element: $(slide),
				title: $(slide).data('title'),
				fullScreen: $(slide).data('full-screen') !== undefined,
				pauses: pauses,
				pauseIndex: pauses.filter('.show').length
			};
		});
	},

	synchronize: function (slideIndex, pauseIndexes) {
		if (this.isPresenter && this.hasControl) {
			pauseIndexes = _.map(this.slides, function (slide) {
				return slide.pauseIndex;
			});
			this.broadcastEvent('synchronize', {
				slideIndex: this.slideIndex,
				pauseIndexes: pauseIndexes
			});
		} else {
			this.setVisiblePauses(pauseIndexes, slideIndex);
			this.goToSlide(slideIndex);
		}
	},

	broadcastEvent: function (eventName, data) {
		if (data === undefined) {
			data = {};
		}
		data.event = eventName;
		if (this.isPresenter) {
			data.presenterToken = this.presenterToken;
		}
		this.connection.send(JSON.stringify(data));
	},

	setVisiblePauses: function (pauseIndexes, slideIndex) {
		var pauses = $('.pause');
		pauses.removeClass('show active');
		_.each(pauseIndexes, function (pauseIndex, slideIndex) {
			this.slides[slideIndex].pauseIndex = pauseIndex;
			this.slides[slideIndex].pauses.each(function (index, pause) {
				if (index < pauseIndex) {
					$(pause).addClass('show');
				}
			});
		}, this);
		$(_.last(this.slides[slideIndex].pauses.filter('.show'))).addClass('active');
	},

	setupHighlightJS: function () {
		$('pre code').each(function(i, block) {
			hljs.highlightBlock(block);
		});
	},

	goToSlide: function (slideIndex) {
		if (slideIndex < 0) { slideIndex = 0; }
		if (slideIndex >= this.slides.length) { slideIndex = this.slides.length - 1; }
		if (this.isPresenter && this.hasControl) {
			this.synchronize();
		}
		_.each(this.slides, function (slide) {
			slide.element.removeClass('active');
		});
		var slide = this.slides[slideIndex];
		slide.element.addClass('active');
		if (slide.fullScreen) {
			$('.header, .footer').addClass('hidden');
		} else {
			$('.header, .footer').removeClass('hidden');
		}
		this.slideIndex = slideIndex;
		this.updateSlideTitle();
		this.updateSectionTitle();
		this.updateProgress();
		this.updateToc();
		location.hash = slideIndex;
	},

	updateSectionTitle: function () {
		var title = this.slides[this.slideIndex].element.closest('.section').data('title');
		$('#section-title').empty().html(title);
	},

	updateSlideTitle: function () {
		var title = this.slides[this.slideIndex].title;
		$('#slide-title').empty().html(title);
	},

	updateProgress: function () {
		var percentage = (this.slideIndex / (this.slides.length - 1)) * 100;
		$('#progress span').css('width', percentage + '%');
	},

	updateTimeProgress: function () {
		var percentage = ((new Date() - this.startTime) / this.timeLimit) * 100;
		if (percentage > 100) {
			$('#time-progress').addClass('overtime');
			percentage = 100;
		}
		$('#time-progress span').css('width', percentage + '%');
	},

	updateToc: function () {
		if (this.isRemote) {
			$('#toc-select').val(this.slideIndex);
		} else {
			$($('#toc .toc-slides li').removeClass('active').get(this.slideIndex)).addClass('active');
		}
	},

	nextSlide: function () {
		this.goToSlide(this.slideIndex + 1);
	},

	next: function (fromRemote) {
		var slide = this.slides[this.slideIndex];
		slide.pauses.removeClass('active');
		if (slide.pauseIndex === slide.pauses.length) {
			this.nextSlide();
		} else {
			var nextPause = $(slide.pauses[slide.pauseIndex]);
			nextPause.addClass('show active');
			slide.pauseIndex += 1;
			if (this.isPresenter && this.hasControl) {
				this.synchronize();
			}
		}
	},

	previousSlide: function () {
		this.goToSlide(this.slideIndex - 1);
	},

	setupFromHash: function () {
		var index = 0;
		if (location.hash.match(/^#\d+/)) {
			index = parseInt(location.hash.substring(1));
		}
		this.goToSlide(index);
	},

	getSlide: function (slideIndex) {
		return $($('.slides .slide').get(slideIndex));
	},

	setupKeybindings: function () {
		app = this;
		var nextSlide = _.bind(this.nextSlide, this);
		var previousSlide = _.bind(this.previousSlide, this);
		var next = _.bind(this.next, this);
		var goToSlide = _.bind(this.goToSlide, this);
		var broadcastEvent = _.bind(this.broadcastEvent, this);
		$(document).on('keypress', function (event) {
			switch(event.which) {
			case 113: // Q
			case 81:
				if (app.isPresenter) {
					$('#remote-qr').toggleClass('hidden');
				}
				break;
			case 32: // space
				var times = app.slideIndexInput !== '' ? parseInt(app.slideIndexInput) : 1;
				for (var i = 0; i < times; i++) {
					if (event.shiftKey) {
						previousSlide();
					} else {
						next();
					}
				}
				break;
			case 13: // enter
				if (app.slideIndexInput !== '') {
					goToSlide(parseInt(app.slideIndexInput));
				} else {
					nextSlide();
				}
				break;
			}
			if (event.which > 47 && event.which < 58) {
				app.slideIndexInput += event.which - 48;
			} else if (!event.shiftKey){
				app.slideIndexInput = '';
			}
			if (app.isPresenter && !app.hasControl) {
				broadcastEvent('registerPresenter');
			}
		});
	}
};

$(document).ready(function () {
	App.init();
});
